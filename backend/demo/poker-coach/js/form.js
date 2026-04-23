// ===== 向导状态 =====

var STEP_TITLES = ["坐到了哪里？", "你的起手牌", "逐街还原行动", "最后结果"];
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

var pickerTarget = null;
var pickerRank = null;

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

function getActivePlayers(order) {
  var heroPos = state.hero_position;
  var oppPositions = state.opponents.map(function (o) { return o.position; });
  var all = [];
  if (heroPos) all.push(heroPos);
  all = all.concat(oppPositions);
  return order.filter(function (pos) { return all.indexOf(pos) !== -1; });
}

function getAliveAfterStreet(street) {
  var order = street === "preflop"
    ? getPositions(state.table_type)
    : getPostflopOrder(state.table_type);
  var alive = getActivePlayers(order);
  var actions = state.actions[street] || [];
  var folded = {};
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (a.action === "fold") folded[pos] = true;
    else if (a.action) delete folded[pos];
  });
  return alive.filter(function (pos) { return !folded[pos]; });
}

function getAliveForStreet(street) {
  var streets = ["preflop", "flop", "turn", "river"];
  var idx = streets.indexOf(street);
  if (idx <= 0) {
    var order = getPositions(state.table_type);
    return getActivePlayers(order);
  }
  return getAliveAfterStreet(streets[idx - 1]);
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
      '<span class="player-label">Hero</span>' +
      '<input class="player-stack-input" type="number" min="1" step="0.5" placeholder="100" value="' + (state.hero_stack_bb || "") + '" />' +
      '<span class="player-stack-suffix">BB</span>';
    heroRow.querySelector("input").addEventListener("input", function (e) {
      state.hero_stack_bb = e.target.value;
    });
    list.appendChild(heroRow);
  }

  state.opponents.forEach(function (opp, idx) {
    var row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML =
      '<span class="player-pos">' + opp.position + '</span>' +
      '<span class="player-label">对手</span>' +
      '<input class="player-stack-input" type="number" min="1" step="0.5" placeholder="100" value="' + (opp.stack_bb || "") + '" />' +
      '<span class="player-stack-suffix">BB</span>' +
      '<button type="button" class="player-remove" data-idx="' + idx + '">✕</button>';
    row.querySelector("input").addEventListener("input", function (e) {
      state.opponents[idx].stack_bb = e.target.value;
    });
    row.querySelector(".player-remove").addEventListener("click", function () {
      state.opponents.splice(idx, 1);
      renderPositionTable();
      renderPlayerList();
    });
    list.appendChild(row);
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

function initStreetActions(street) {
  var alive;
  if (street === "preflop") {
    var preflopOrder = getPositions(state.table_type);
    alive = getActivePlayers(preflopOrder);
  } else {
    var postflopOrder = getPostflopOrder(state.table_type);
    alive = getAliveForStreet(street);
    alive = postflopOrder.filter(function (pos) { return alive.indexOf(pos) !== -1; });
  }

  state.actions[street] = alive.map(function (pos) {
    var isHero = (pos === state.hero_position);
    return {
      position: isHero ? "Hero" : pos,
      action: "",
      amount: null,
    };
  });
}

function renderActionBuilder(street) {
  var containerId = street + "Builder";
  var container = $(containerId);
  if (!container) return;
  container.innerHTML = "";

  var actions = state.actions[street] || [];
  var isPreflop = (street === "preflop");
  var actionOptions = isPreflop ? PREFLOP_ACTIONS : POSTFLOP_ACTIONS;

  actions.forEach(function (act, idx) {
    var isHero = (act.position === "Hero");
    var row = document.createElement("div");
    row.className = "action-row" + (isHero ? " hero-row" : "");

    var posSpan = document.createElement("span");
    posSpan.className = "action-pos";
    posSpan.textContent = act.position;
    row.appendChild(posSpan);

    var select = document.createElement("select");
    select.className = "action-select";
    var defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "选择…";
    select.appendChild(defaultOpt);
    actionOptions.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (act.action === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", function () {
      handleActionChange(street, idx, select.value);
    });
    row.appendChild(select);

    var amountInput = document.createElement("input");
    amountInput.className = "action-amount";
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "0.5";
    amountInput.placeholder = "BB";
    amountInput.value = act.amount != null ? act.amount : "";
    amountInput.hidden = !actionNeedsAmount(act.action);
    amountInput.addEventListener("input", function () {
      state.actions[street][idx].amount = amountInput.value !== "" ? parseFloat(amountInput.value) : null;
    });
    row.appendChild(amountInput);

    container.appendChild(row);
  });

  var foldedPlayers = getFoldedPlayersForStreet(street);
  if (foldedPlayers.length > 0) {
    var addDiv = document.createElement("div");
    addDiv.className = "add-player-dropdown";
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-player-btn";
    addBtn.textContent = "+ 添加玩家";
    addBtn.addEventListener("click", function () {
      toggleAddPlayerMenu(addDiv, street, foldedPlayers);
    });
    addDiv.appendChild(addBtn);
    container.appendChild(addDiv);
  }
}

function handleActionChange(street, idx, newAction) {
  var actions = state.actions[street];
  var oldAction = actions[idx].action;
  actions[idx].action = newAction;
  actions[idx].amount = null;

  if (isAggressiveAction(newAction) && !isAggressiveAction(oldAction)) {
    smartAppend(street, idx);
  }

  renderActionBuilder(street);
}

function smartAppend(street, raiserIdx) {
  var actions = state.actions[street];
  var raiserPos = actions[raiserIdx].position;
  var isPreflop = (street === "preflop");
  var order = isPreflop ? getPositions(state.table_type) : getPostflopOrder(state.table_type);

  var activePlayers = getActivePlayers(order);

  var raiserActualPos = raiserPos === "Hero" ? state.hero_position : raiserPos;
  var raiserOrderIdx = order.indexOf(raiserActualPos);
  if (raiserOrderIdx === -1) return;

  var toAppend = [];
  for (var i = 1; i < order.length; i++) {
    var checkPos = order[(raiserOrderIdx + i) % order.length];
    if (checkPos === raiserActualPos) break;
    if (activePlayers.indexOf(checkPos) === -1) continue;

    var isHero = (checkPos === state.hero_position);
    var label = isHero ? "Hero" : checkPos;
    var alreadyResponded = false;
    for (var j = raiserIdx + 1; j < actions.length; j++) {
      if (actions[j].position === label) {
        alreadyResponded = true;
        break;
      }
    }
    if (alreadyResponded) continue;

    var hasFolded = false;
    for (var k = 0; k <= raiserIdx; k++) {
      if (actions[k].position === label && actions[k].action === "fold") {
        hasFolded = true;
      }
      if (actions[k].position === label && actions[k].action !== "fold") {
        hasFolded = false;
      }
    }
    if (hasFolded) continue;

    toAppend.push({ position: label, action: "fold", amount: null });
  }

  toAppend.forEach(function (a) { actions.push(a); });
}

function getFoldedPlayersForStreet(street) {
  var isPreflop = (street === "preflop");
  var order = isPreflop ? getPositions(state.table_type) : getPostflopOrder(state.table_type);
  var allActive = getActivePlayers(order);

  var actions = state.actions[street] || [];
  var foldState = {};
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (a.action === "fold") foldState[pos] = true;
    else delete foldState[pos];
  });

  if (!isPreflop) {
    var aliveBefore = getAliveForStreet(street);
    allActive.forEach(function (pos) {
      if (aliveBefore.indexOf(pos) === -1) {
        foldState[pos] = true;
      }
    });
  }

  var folded = [];
  Object.keys(foldState).forEach(function (pos) {
    if (foldState[pos]) {
      folded.push(pos === state.hero_position ? "Hero" : pos);
    }
  });

  return folded;
}

function toggleAddPlayerMenu(container, street, foldedPlayers) {
  var existing = container.querySelector(".add-player-menu");
  if (existing) { existing.remove(); return; }

  var menu = document.createElement("div");
  menu.className = "add-player-menu";
  foldedPlayers.forEach(function (label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", function () {
      state.actions[street].push({ position: label, action: "", amount: null });
      renderActionBuilder(street);
    });
    menu.appendChild(btn);
  });
  container.appendChild(menu);

  setTimeout(function () {
    document.addEventListener("click", function handler(e) {
      if (!container.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", handler);
      }
    });
  }, 0);
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

// ===== 通用 card-slot 渲染 =====

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
      if (isCardUsed(card, pickerTarget)) {
        showToast(card + " 已被其他位置占用");
        return;
      }
      var slot = targetSlot(pickerTarget);
      slot.arr[slot.idx] = card;
      var prevTarget = pickerTarget;
      closeCardPicker();
      renderAllSlots();
      if (prevTarget === "hero:0" && !state.hero_cards[1]) {
        setTimeout(function () { openCardPicker("hero:1"); }, 120);
      } else if (prevTarget === "flop:0" && !state.flop_cards[1]) {
        setTimeout(function () { openCardPicker("flop:1"); }, 120);
      } else if (prevTarget === "flop:1" && !state.flop_cards[2]) {
        setTimeout(function () { openCardPicker("flop:2"); }, 120);
      } else if (prevTarget === "opp:0" && !state.showdown_opp_cards[1]) {
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
  renderStreetVisibility();
  renderAllSlots();
  ["preflop", "flop", "turn", "river"].forEach(function (s) {
    if (s === "preflop" || state[s + "_open"]) {
      renderActionBuilder(s);
    }
  });
}

(function init() {
  var today = new Date().toISOString().slice(0, 10);
  $("playedAt").value = today;
  state.played_at = today;
  $("playedAt").addEventListener("input", function (e) { state.played_at = e.target.value; });

  bindBlindChips();
  bindTableSeg();
  bindStreetToggles();
  bindResultStepper();
  bindCardSlots();
  buildRankGrid();
  bindSuitGrid();

  $("cardPickerClose").addEventListener("click", closeCardPicker);
  $("cardPickerMask").addEventListener("click", closeCardPicker);

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
