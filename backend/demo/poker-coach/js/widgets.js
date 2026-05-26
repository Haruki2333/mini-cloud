/**
 * 共享 UI 组件 — 选牌弹层 + 行动构建器
 *
 * form.html 与 confirm.html 共用此文件。
 * 依赖：types.js（POSITIONS、PREFLOP_ACTIONS、POSTFLOP_ACTIONS、actionNeedsAmount 等）
 *
 * 调用方提供 state 对象（结构与 form.js 的 state 一致：hero_position / opponents / table_type / hero_cards
 * / flop_cards / turn_card / river_card / showdown_opp_cards / actions），widgets 操作这个 state 并通过
 * onChange 回调让调用方触发重渲。
 */

// ===== 状态遍历助手（纯函数）=====

function widgetGetActivePlayers(state, order) {
  var heroPos = state.hero_position;
  var oppPositions = state.opponents.map(function (o) { return o.position; });
  var all = [];
  if (heroPos) all.push(heroPos);
  all = all.concat(oppPositions);
  return order.filter(function (pos) { return all.indexOf(pos) !== -1; });
}

function widgetGetAliveAfterStreet(state, street) {
  var order = street === "preflop"
    ? getPositions(state.table_type)
    : getPostflopOrder(state.table_type);
  var alive = widgetGetActivePlayers(state, order);
  var actions = state.actions[street] || [];
  var folded = {};
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (a.action === "fold") folded[pos] = true;
    else if (a.action) delete folded[pos];
  });
  return alive.filter(function (pos) { return !folded[pos]; });
}

function widgetGetAliveForStreet(state, street) {
  var streets = ["preflop", "flop", "turn", "river"];
  var idx = streets.indexOf(street);
  if (idx <= 0) {
    var order = getPositions(state.table_type);
    return widgetGetActivePlayers(state, order);
  }
  return widgetGetAliveAfterStreet(state, streets[idx - 1]);
}

function widgetInitStreetActions(state, street) {
  var alive;
  if (street === "preflop") {
    var preflopOrder = getPositions(state.table_type);
    alive = widgetGetActivePlayers(state, preflopOrder);
  } else {
    var postflopOrder = getPostflopOrder(state.table_type);
    alive = widgetGetAliveForStreet(state, street);
    alive = postflopOrder.filter(function (pos) { return alive.indexOf(pos) !== -1; });
  }
  state.actions[street] = alive.map(function (pos) {
    var isHero = (pos === state.hero_position);
    return { position: isHero ? "Hero" : pos, action: "", amount: null };
  });
}

// ===== 选牌弹层 =====
//
// 用法：在 HTML 中放置 #cardPickerMask / #cardPickerSheet / #rankGrid / #suitGrid / #cardPickerTitle
// / #pickedRank / #cardPickerClose；初始化时调 widgetInitCardPicker({state, onPick, autoAdvance})。
//   - state: 全局状态，用于 isCardUsed 判重
//   - onPick(target, card): 选完一张牌时回调
//   - autoAdvance: target → nextTarget 映射，自动追打开下一张（可选）

var __picker = {
  state: null,
  onPick: null,
  autoAdvance: null,
  target: null,
  rank: null,
};

function widgetIsCardUsed(state, card, exceptTarget) {
  var groups = [
    ["hero:0", state.hero_cards && state.hero_cards[0]],
    ["hero:1", state.hero_cards && state.hero_cards[1]],
    ["flop:0", state.flop_cards && state.flop_cards[0]],
    ["flop:1", state.flop_cards && state.flop_cards[1]],
    ["flop:2", state.flop_cards && state.flop_cards[2]],
    ["turn:0", state.turn_card && state.turn_card[0]],
    ["river:0", state.river_card && state.river_card[0]],
    ["opp:0", state.showdown_opp_cards && state.showdown_opp_cards[0]],
    ["opp:1", state.showdown_opp_cards && state.showdown_opp_cards[1]],
  ];
  return groups.some(function (g) { return g[1] === card && g[0] !== exceptTarget; });
}

function widgetBuildRankGrid() {
  var grid = document.getElementById("rankGrid");
  if (!grid) return;
  grid.innerHTML = "";
  var ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  ranks.forEach(function (r) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = r;
    b.addEventListener("click", function () {
      __picker.rank = r;
      var pr = document.getElementById("pickedRank");
      if (pr) pr.textContent = "→ " + r;
      Array.prototype.forEach.call(
        grid.querySelectorAll("button"),
        function (x) { x.classList.toggle("active", x.textContent === r); }
      );
    });
    grid.appendChild(b);
  });
}

function widgetBindSuitGrid() {
  var grid = document.getElementById("suitGrid");
  if (!grid) return;
  Array.prototype.forEach.call(grid.querySelectorAll("button"), function (b) {
    b.addEventListener("click", function () {
      if (!__picker.rank) { showToast("先选点数"); return; }
      var card = __picker.rank + b.dataset.suit;
      if (!__picker.target) return;
      if (widgetIsCardUsed(__picker.state, card, __picker.target)) {
        showToast(card + " 已被其他位置占用");
        return;
      }
      var prevTarget = __picker.target;
      __picker.onPick(prevTarget, card);
      widgetCloseCardPicker();
      // 选完后回调宿主决定是否追打开下一张（动态判断槽位是否已填）
      if (typeof __picker.autoAdvance === "function") {
        var next = __picker.autoAdvance(prevTarget);
        if (next) setTimeout(function () { widgetOpenCardPicker(next); }, 120);
      }
    });
  });
}

function widgetOpenCardPicker(target) {
  __picker.target = target;
  __picker.rank = null;
  var label = {
    "hero:0": "起手牌 · 第 1 张", "hero:1": "起手牌 · 第 2 张",
    "flop:0": "翻牌 · 第 1 张", "flop:1": "翻牌 · 第 2 张", "flop:2": "翻牌 · 第 3 张",
    "turn:0": "转牌", "river:0": "河牌",
    "opp:0": "对手底牌 · 第 1 张", "opp:1": "对手底牌 · 第 2 张",
  }[target] || "选张牌";
  var title = document.getElementById("cardPickerTitle");
  if (title) title.textContent = label;
  var pr = document.getElementById("pickedRank");
  if (pr) pr.textContent = "";
  var grid = document.getElementById("rankGrid");
  if (grid) Array.prototype.forEach.call(grid.querySelectorAll("button"), function (x) { x.classList.remove("active"); });
  var mask = document.getElementById("cardPickerMask");
  var sheet = document.getElementById("cardPickerSheet");
  if (mask) mask.hidden = false;
  if (sheet) sheet.hidden = false;
}

function widgetCloseCardPicker() {
  __picker.target = null;
  __picker.rank = null;
  var mask = document.getElementById("cardPickerMask");
  var sheet = document.getElementById("cardPickerSheet");
  if (mask) mask.hidden = true;
  if (sheet) sheet.hidden = true;
}

function widgetInitCardPicker(opts) {
  __picker.state = opts.state;
  __picker.onPick = opts.onPick;
  __picker.autoAdvance = opts.autoAdvance || null;
  widgetBuildRankGrid();
  widgetBindSuitGrid();
  var close = document.getElementById("cardPickerClose");
  var mask = document.getElementById("cardPickerMask");
  if (close) close.addEventListener("click", widgetCloseCardPicker);
  if (mask) mask.addEventListener("click", widgetCloseCardPicker);
}

// ===== card-slot 渲染（按钮内含一张牌或占位）=====

function widgetRenderCardSlot(btn, card) {
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

// ===== 行动构建器 =====
//
// 调用：widgetRenderActionBuilder({container, state, street, onChange})
// 行为：在 container 内渲染该街所有 action 行（位置 × 动作 select × 金额 input），
// 用户改动写回 state.actions[street] 并触发 onChange()（调用方决定如何重渲整页/同街）。
//
// 智能追加：当用户为某玩家选择 raise/3bet/bet/all-in 等激进行动时，自动给后续未行动玩家追加 fold 行。
// "添加玩家"菜单：列出已 fold 的玩家，允许调用方为他们再补一行。

function widgetRenderActionBuilder(opts) {
  var container = opts.container;
  var state = opts.state;
  var street = opts.street;
  var onChange = opts.onChange || function () {};
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
    actionOptions.forEach(function (op) {
      var o = document.createElement("option");
      o.value = op;
      o.textContent = op;
      if (act.action === op) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", function () {
      widgetHandleActionChange(state, street, idx, select.value);
      widgetRenderActionBuilder(opts);
      onChange();
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
      onChange();
    });
    row.appendChild(amountInput);

    container.appendChild(row);
  });

  var foldedPlayers = widgetGetFoldedPlayersForStreet(state, street);
  if (foldedPlayers.length > 0) {
    var addDiv = document.createElement("div");
    addDiv.className = "add-player-dropdown";
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-player-btn";
    addBtn.textContent = "+ 添加玩家";
    addBtn.addEventListener("click", function () {
      widgetToggleAddPlayerMenu(addDiv, state, street, foldedPlayers, function () {
        widgetRenderActionBuilder(opts);
        onChange();
      });
    });
    addDiv.appendChild(addBtn);
    container.appendChild(addDiv);
  }
}

function widgetHandleActionChange(state, street, idx, newAction) {
  var actions = state.actions[street];
  var oldAction = actions[idx].action;
  actions[idx].action = newAction;
  actions[idx].amount = null;
  if (isAggressiveAction(newAction) && !isAggressiveAction(oldAction)) {
    widgetSmartAppend(state, street, idx);
  }
}

function widgetSmartAppend(state, street, raiserIdx) {
  var actions = state.actions[street];
  var raiserPos = actions[raiserIdx].position;
  var isPreflop = (street === "preflop");
  var order = isPreflop ? getPositions(state.table_type) : getPostflopOrder(state.table_type);
  var activePlayers = widgetGetActivePlayers(state, order);

  var raiserActualPos = raiserPos === "Hero" ? state.hero_position : raiserPos;
  var raiserOrderIdx = order.indexOf(raiserActualPos);
  if (raiserOrderIdx === -1) return;

  for (var i = 1; i < order.length; i++) {
    var checkPos = order[(raiserOrderIdx + i) % order.length];
    if (checkPos === raiserActualPos) break;
    if (activePlayers.indexOf(checkPos) === -1) continue;

    var isHero = (checkPos === state.hero_position);
    var label = isHero ? "Hero" : checkPos;
    var alreadyResponded = false;
    for (var j = raiserIdx + 1; j < actions.length; j++) {
      if (actions[j].position === label) { alreadyResponded = true; break; }
    }
    if (alreadyResponded) continue;

    var hasFolded = false;
    for (var k = 0; k <= raiserIdx; k++) {
      if (actions[k].position === label && actions[k].action === "fold") hasFolded = true;
      if (actions[k].position === label && actions[k].action !== "fold") hasFolded = false;
    }
    if (hasFolded) continue;

    actions.push({ position: label, action: "fold", amount: null });
  }
}

function widgetGetFoldedPlayersForStreet(state, street) {
  var isPreflop = (street === "preflop");
  var order = isPreflop ? getPositions(state.table_type) : getPostflopOrder(state.table_type);
  var allActive = widgetGetActivePlayers(state, order);

  var actions = state.actions[street] || [];
  var foldState = {};
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (a.action === "fold") foldState[pos] = true;
    else delete foldState[pos];
  });

  if (!isPreflop) {
    var aliveBefore = widgetGetAliveForStreet(state, street);
    allActive.forEach(function (pos) {
      if (aliveBefore.indexOf(pos) === -1) foldState[pos] = true;
    });
  }

  var folded = [];
  Object.keys(foldState).forEach(function (pos) {
    if (foldState[pos]) folded.push(pos === state.hero_position ? "Hero" : pos);
  });
  return folded;
}

function widgetToggleAddPlayerMenu(container, state, street, foldedPlayers, onAdded) {
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
      onAdded();
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
