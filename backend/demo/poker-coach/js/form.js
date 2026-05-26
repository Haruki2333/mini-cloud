// ===== 向导状态 =====

var STEP_TITLES = ["坐到了哪里？", "你的起手牌", "逐街行动与结果"];
var TABLE_LABEL = { "6max": "six-max", "9max": "nine-max", "hu": "heads-up" };

var state = {
  step: 0,
  blind_level: "",
  blind_custom: false,
  table_type: "9max",
  hero_position: null,
  played_at: "",
  opponents: [],
  hero_stack_bb: "",
  hero_cards: [null, null],
  actions: { preflop: [], flop: [], turn: [], river: [] },
  flop_open: false,
  flop_cards: [null, null, null],
  turn_open: false,
  turn_card: [null],
  river_open: false,
  river_card: [null],
  result_bb: "",
  showdown_opp_cards: [null, null],
  opponent_notes: "",
  notes: "",
};

// ===== 通用工具 =====

function $(id) { return document.getElementById(id); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

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

// 以下三个函数曾内联在本文件，现迁至 widgets.js（widgetGetActivePlayers / widgetGetAliveAfterStreet
// / widgetGetAliveForStreet），保留同名薄包装以最小化本文件调用点改动。
function getActivePlayers(order) { return widgetGetActivePlayers(state, order); }
function getAliveAfterStreet(street) { return widgetGetAliveAfterStreet(state, street); }
function getAliveForStreet(street) { return widgetGetAliveForStreet(state, street); }

// ===== 步骤切换 =====

function gotoStep(idx) {
  if (idx < 0 || idx > 2) return;
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
  $("stepCounter").textContent = (idx + 1) + "/3";

  $("prevBtn").disabled = (idx === 0);
  $("nextBtn").textContent = (idx === 2) ? "保存并分析" : "下一步 →";

  $("scrollArea").scrollTop = 0;

  if (idx === 2 && state.actions.preflop.length === 0) {
    initStreetActions("preflop");
  }

  refreshAll();
}

function validateStep(idx) {
  if (idx === 0) {
    if (!state.blind_level)   return "请选择盲注级别";
    if (!state.hero_position) return "请选择 Hero 位置";
    if (state.opponents.length === 0) return "请至少标记一个对手";
    return null;
  }
  if (idx === 1) {
    if (!state.hero_cards[0] || !state.hero_cards[1]) return "请选齐两张起手牌";
    if (state.hero_cards[0] === state.hero_cards[1])  return "两张牌不能相同";
    return null;
  }
  if (idx === 2) {
    if (state.actions.preflop.length === 0) return "请填写翻前行动";
    var hasEmpty = state.actions.preflop.some(function (a) { return !a.action; });
    if (hasEmpty) return "请为每个玩家选择翻前行动";
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
  if (state.step === 2) { submit(); return; }
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
  var positions = getPositions(state.table_type);
  if (state.hero_position && positions.indexOf(state.hero_position) === -1) {
    state.hero_position = null;
  }
  state.opponents = state.opponents.filter(function (o) {
    return positions.indexOf(o.position) !== -1;
  });
  renderPositionTable();
  renderPlayerList();
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
  var rect = table.getBoundingClientRect();
  var size = rect.width || 280;
  var seatSize = size <= 250 ? 50 : 56;
  var cx = size / 2, cy = size / 2;
  var r = (size / 2) - seatSize * 0.55;
  var oppPositions = state.opponents.map(function (o) { return o.position; });

  positions.forEach(function (pos, i) {
    var a = (-Math.PI / 2) + (i * 2 * Math.PI / n);
    var x = cx + r * Math.cos(a);
    var y = cy + r * Math.sin(a);
    var btn = document.createElement("button");
    btn.type = "button";
    var isHero = (state.hero_position === pos);
    var isOpp = (oppPositions.indexOf(pos) !== -1);
    btn.className = "seat" + (isHero ? " selected" : "") + (isOpp ? " opponent" : "");
    btn.style.left = (x - seatSize / 2) + "px";
    btn.style.top  = (y - seatSize / 2) + "px";
    btn.textContent = pos;
    btn.addEventListener("click", function () {
      handleSeatClick(pos);
    });
    table.appendChild(btn);
  });

  updatePositionHint();
}

function handleSeatClick(pos) {
  var isHero = (state.hero_position === pos);
  var oppIdx = -1;
  state.opponents.forEach(function (o, i) { if (o.position === pos) oppIdx = i; });
  var isOpp = (oppIdx !== -1);

  if (isHero) {
    state.hero_position = null;
  } else if (isOpp) {
    state.opponents.splice(oppIdx, 1);
  } else if (!state.hero_position) {
    state.hero_position = pos;
  } else {
    state.opponents.push({ position: pos, stack_bb: "" });
  }

  renderPositionTable();
  renderPlayerList();
}

function updatePositionHint() {
  var hint = $("positionHint");
  if (!state.hero_position) {
    hint.textContent = "先点圆圈选 Hero，再点其他位置添加对手";
    hint.classList.remove("filled");
  } else if (state.opponents.length === 0) {
    hint.textContent = "Hero: " + state.hero_position + " — 点其他位置添加对手";
    hint.classList.add("filled");
  } else {
    hint.textContent = "Hero: " + state.hero_position + " + " + state.opponents.length + " 个对手";
    hint.classList.add("filled");
  }
}

function renderPlayerList() {
  var list = $("playerList");
  list.innerHTML = "";

  if (!state.hero_position && state.opponents.length === 0) {
    list.innerHTML = '<div class="player-list-hint">点击圆桌上的空位添加对手</div>';
    return;
  }

  if (state.hero_position) {
    var heroRow = document.createElement("div");
    heroRow.className = "player-row hero";
    heroRow.innerHTML =
      '<span class="player-pos">' + state.hero_position + '</span>' +
      '<span class="player-label">Hero</span>';
    list.appendChild(heroRow);
  }

  state.opponents.forEach(function (opp, idx) {
    var row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML =
      '<span class="player-pos">' + opp.position + '</span>' +
      '<span class="player-label">对手</span>' +
      '<button type="button" class="player-remove" data-idx="' + idx + '">✕</button>';
    row.querySelector(".player-remove").addEventListener("click", function () {
      state.opponents.splice(idx, 1);
      renderPositionTable();
      renderPlayerList();
    });
    list.appendChild(row);
  });
}

// ===== 步骤 1: 筹码 =====

function renderStackInputs() {
  var container = $("stackInputSection");
  if (!container) return;
  container.innerHTML = "";

  if (!state.hero_position) {
    container.innerHTML = '<div class="player-list-hint">请先在第一步选择座位</div>';
    return;
  }

  var heroRow = document.createElement("div");
  heroRow.className = "player-row hero";
  heroRow.innerHTML =
    '<span class="player-pos">' + state.hero_position + '</span>' +
    '<span class="player-label">Hero</span>' +
    '<input class="player-stack-input" type="number" min="1" step="0.5" placeholder="100" value="' + (state.hero_stack_bb || "") + '" />' +
    '<span class="player-stack-suffix">BB</span>';
  heroRow.querySelector("input").addEventListener("input", function (e) {
    state.hero_stack_bb = e.target.value;
  });
  container.appendChild(heroRow);

  state.opponents.forEach(function (opp, idx) {
    var row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML =
      '<span class="player-pos">' + opp.position + '</span>' +
      '<span class="player-label">对手</span>' +
      '<input class="player-stack-input" type="number" min="1" step="0.5" placeholder="100" value="' + (opp.stack_bb || "") + '" />' +
      '<span class="player-stack-suffix">BB</span>';
    row.querySelector("input").addEventListener("input", function (e) {
      state.opponents[idx].stack_bb = e.target.value;
    });
    container.appendChild(row);
  });
}

// ===== 步骤 1: 起手牌 =====

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

// ===== 步骤 2: 行动构建器 =====
// 实现已迁至 widgets.js（widgetInitStreetActions / widgetRenderActionBuilder 等）。
// 这里保留同名包装：initStreetActions / renderActionBuilder 提供旧 API。

function initStreetActions(street) {
  widgetInitStreetActions(state, street);
}

function renderActionBuilder(street) {
  var container = $(street + "Builder");
  widgetRenderActionBuilder({ container: container, state: state, street: street, onChange: function () {} });
}

function renderStreetVisibility() {
  ["flop", "turn", "river"].forEach(function (s) {
    var pane = document.querySelector('.street-pane[data-street="' + s + '"]');
    var addBtn = document.querySelector('.street-add[data-add="' + s + '"]');
    var open = state[s + "_open"];
    pane.hidden = !open;
    addBtn.hidden = open;
  });
  var flopAdd = document.querySelector('.street-add[data-add="flop"]');
  var turnAdd = document.querySelector('.street-add[data-add="turn"]');
  var riverAdd = document.querySelector('.street-add[data-add="river"]');
  if (!state.flop_open) flopAdd.hidden = false;
  turnAdd.hidden = !state.flop_open || state.turn_open;
  riverAdd.hidden = !state.turn_open || state.river_open;

  // 当存活玩家 <= 1 时自动隐藏后续街的 "+" 按钮
  var preflopAlive = getAliveAfterStreet("preflop");
  if (preflopAlive.length <= 1) { flopAdd.hidden = true; }
  if (state.flop_open) {
    var flopAlive = getAliveAfterStreet("flop");
    if (flopAlive.length <= 1) { turnAdd.hidden = true; }
  }
  if (state.turn_open) {
    var turnAlive = getAliveAfterStreet("turn");
    if (turnAlive.length <= 1) { riverAdd.hidden = true; }
  }
}

function bindStreetToggles() {
  $$(".street-add").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var s = btn.dataset.add;
      state[s + "_open"] = true;
      initStreetActions(s);
      renderStreetVisibility();
      renderActionBuilder(s);
    });
  });
  $$(".street-remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var s = btn.dataset.remove;
      state[s + "_open"] = false;
      if (s === "flop")  { state.turn_open = false; state.river_open = false; }
      if (s === "turn")  { state.river_open = false; }
      if (s === "flop")  { state.flop_cards = [null, null, null]; state.actions.flop = []; }
      if (s === "turn")  { state.turn_card = [null];  state.actions.turn = []; }
      if (s === "river") { state.river_card = [null]; state.actions.river = []; }
      renderAllSlots();
      renderStreetVisibility();
    });
  });
}

// ===== 步骤 2: 结果 =====

function calcHeroResultBB() {
  var streets = ["preflop", "flop", "turn", "river"];
  var heroTotalInvested = 0;
  var heroLastAction = null;

  // 加入盲注（近似）
  var pos = state.hero_position;
  if (pos === "SB") heroTotalInvested += 0.5;
  else if (pos === "BB") heroTotalInvested += 1;

  streets.forEach(function (s) {
    (state.actions[s] || []).forEach(function (a) {
      if (a.position === "Hero" && a.action) {
        heroLastAction = a.action;
        if (a.amount != null && !isNaN(parseFloat(a.amount))) {
          heroTotalInvested += parseFloat(a.amount);
        }
      }
    });
  });

  if (heroLastAction === "fold") {
    return -(Math.round(heroTotalInvested * 2) / 2);
  }
  return null;
}

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
  $("autoCalcBtn").addEventListener("click", function () {
    var estimated = calcHeroResultBB();
    if (estimated !== null) {
      $("resultBB").value = estimated;
      state.result_bb = estimated.toString();
      showToast("已估算（仅供参考）");
    } else {
      showToast("请手动填写结果");
    }
  });
}

// ===== 通用 card-slot 渲染 =====

function renderCardSlot(btn) {
  var target = btn.dataset.target;
  var slot = targetSlot(target);
  var card = slot.arr[slot.idx];
  widgetRenderCardSlot(btn, card);
}

function renderAllSlots() {
  $$(".card-slot").forEach(renderCardSlot);
  renderHandTip();
}

function bindCardSlots() {
  $$(".card-slot").forEach(function (btn) {
    btn.addEventListener("click", function () {
      widgetOpenCardPicker(btn.dataset.target);
    });
  });
  $("heroClear").addEventListener("click", function () {
    state.hero_cards = [null, null];
    renderAllSlots();
  });
}

// ===== 提交 =====

function serializeActionsToText(actionsArr) {
  if (!actionsArr || actionsArr.length === 0) return "";
  return actionsArr.map(function (a) {
    var text = a.position + " " + a.action;
    if (a.amount != null) text += " " + a.amount;
    return text;
  }).join("，");
}

function buildPayload() {
  function joinCards(arr) {
    var cs = arr.filter(Boolean);
    return cs.length ? cs.join(" ") : null;
  }

  var effectiveStack = state.hero_stack_bb !== "" ? parseFloat(state.hero_stack_bb) : null;

  var opponents = state.opponents.map(function (o) {
    return {
      position: o.position,
      stack_bb: o.stack_bb !== "" ? parseFloat(o.stack_bb) : null,
    };
  });

  var actions = {
    preflop: state.actions.preflop.filter(function (a) { return a.action; }),
  };
  if (state.flop_open) actions.flop = state.actions.flop.filter(function (a) { return a.action; });
  if (state.turn_open) actions.turn = state.actions.turn.filter(function (a) { return a.action; });
  if (state.river_open) actions.river = state.actions.river.filter(function (a) { return a.action; });

  return {
    blind_level: state.blind_level,
    table_type: state.table_type,
    hero_position: state.hero_position,
    hero_cards: state.hero_cards.filter(Boolean).join(" "),
    effective_stack_bb: effectiveStack,
    opponents: opponents,
    actions: actions,
    preflop_actions: serializeActionsToText(actions.preflop),
    flop_cards:   state.flop_open  ? joinCards(state.flop_cards)  : null,
    flop_actions: state.flop_open  ? (serializeActionsToText(actions.flop) || null) : null,
    turn_card:    state.turn_open  ? (state.turn_card[0] || null) : null,
    turn_actions: state.turn_open  ? (serializeActionsToText(actions.turn) || null) : null,
    river_card:   state.river_open ? (state.river_card[0] || null) : null,
    river_actions:state.river_open ? (serializeActionsToText(actions.river) || null) : null,
    result_bb:    state.result_bb !== "" ? parseFloat(state.result_bb) : null,
    showdown_opp_cards: state.showdown_opp_cards.filter(Boolean).length === 2
      ? state.showdown_opp_cards.join(" ") : null,
    opponent_notes: state.opponent_notes.trim() || null,
    notes: state.notes.trim() || null,
    played_at: state.played_at || null,
    raw_input: state._raw_input || null,
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
  renderPlayerList();
  renderStackInputs();
  renderStreetVisibility();
  renderAllSlots();
  ["preflop", "flop", "turn", "river"].forEach(function (s) {
    if (s === "preflop" || state[s + "_open"]) {
      renderActionBuilder(s);
    }
  });
}

// ===== 从 sessionStorage 读取快速录入草稿，预填 state =====
//
// 触发条件：URL 带 ?prefill=1 时（home.js 在解析失败时跳转到此）。读取后清掉 sessionStorage
// 防止刷新页面再次预填。只设置 state 字段；后续 refreshAll 会根据 state 重渲所有控件。

function applyPrefillFromQuickEntry() {
  if (!/[?&]prefill=/.test(window.location.search)) return false;
  var raw;
  try { raw = sessionStorage.getItem("quickEntryDraft"); } catch (_) { return false; }
  if (!raw) return false;
  sessionStorage.removeItem("quickEntryDraft");
  var draft;
  try { draft = JSON.parse(raw); } catch (_) { return false; }
  var hand = draft.hand || {};

  if (hand.blind_level) {
    var presetBlinds = ["0.5/1", "1/2", "2/5", "5/10", "10/25", "25/50"];
    state.blind_level = hand.blind_level;
    state.blind_custom = presetBlinds.indexOf(hand.blind_level) === -1;
  }
  if (hand.table_type) state.table_type = hand.table_type;
  if (hand.hero_position) state.hero_position = hand.hero_position;

  if (typeof hand.hero_cards === "string" && hand.hero_cards.length >= 4) {
    state.hero_cards = [hand.hero_cards.slice(0, 2), hand.hero_cards.slice(2, 4)];
  }
  if (hand.effective_stack_bb != null) state.hero_stack_bb = String(hand.effective_stack_bb);
  if (Array.isArray(hand.opponents)) {
    state.opponents = hand.opponents.map(function (o) {
      return { position: o.position, stack_bb: o.stack_bb != null ? String(o.stack_bb) : "" };
    });
  }

  if (hand.actions && typeof hand.actions === "object") {
    ["preflop", "flop", "turn", "river"].forEach(function (s) {
      if (Array.isArray(hand.actions[s])) state.actions[s] = hand.actions[s];
    });
  }

  if (typeof hand.flop_cards === "string" && hand.flop_cards.length >= 6) {
    state.flop_cards = [hand.flop_cards.slice(0, 2), hand.flop_cards.slice(2, 4), hand.flop_cards.slice(4, 6)];
    state.flop_open = true;
  }
  if (typeof hand.turn_card === "string" && hand.turn_card.length === 2) {
    state.turn_card = [hand.turn_card];
    state.turn_open = true;
  }
  if (typeof hand.river_card === "string" && hand.river_card.length === 2) {
    state.river_card = [hand.river_card];
    state.river_open = true;
  }

  if (hand.result_bb != null) state.result_bb = String(hand.result_bb);
  if (typeof hand.showdown_opp_cards === "string" && hand.showdown_opp_cards.length >= 4) {
    state.showdown_opp_cards = [hand.showdown_opp_cards.slice(0, 2), hand.showdown_opp_cards.slice(2, 4)];
  }
  if (typeof hand.opponent_notes === "string") state.opponent_notes = hand.opponent_notes;
  if (typeof hand.notes === "string") state.notes = hand.notes;

  // raw_input 暂存到 state，submit 时透传
  if (typeof draft.raw_input === "string") state._raw_input = draft.raw_input;

  return true;
}

(function init() {
  var today = new Date().toISOString().slice(0, 10);
  $("playedAt").value = today;
  state.played_at = today;
  $("playedAt").addEventListener("input", function (e) { state.played_at = e.target.value; });

  applyPrefillFromQuickEntry();

  bindBlindChips();
  bindTableSeg();
  bindStreetToggles();
  bindResultStepper();
  bindCardSlots();

  // 选牌弹层：把选中的牌写回 state，自动追打开同组下一张
  widgetInitCardPicker({
    state: state,
    onPick: function (target, card) {
      var slot = targetSlot(target);
      slot.arr[slot.idx] = card;
      renderAllSlots();
    },
    autoAdvance: function (prevTarget) {
      if (prevTarget === "hero:0" && !state.hero_cards[1]) return "hero:1";
      if (prevTarget === "flop:0" && !state.flop_cards[1]) return "flop:1";
      if (prevTarget === "flop:1" && !state.flop_cards[2]) return "flop:2";
      if (prevTarget === "opp:0"  && !state.showdown_opp_cards[1]) return "opp:1";
      return null;
    },
  });

  $("prevBtn").addEventListener("click", prevStep);
  $("nextBtn").addEventListener("click", nextStep);

  $$(".wizard-step").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = parseInt(el.dataset.idx, 10);
      if (target <= state.step) { gotoStep(target); return; }
      for (var i = state.step; i < target; i++) {
        var err = validateStep(i);
        if (err) { showToast(err); return; }
      }
      gotoStep(target);
    });
  });

  gotoStep(0);
}());
