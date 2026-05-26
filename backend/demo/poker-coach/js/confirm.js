/**
 * 确认页 — 单屏概览 + 行内编辑
 *
 * 流程：home.js 把 /parse 返回的 {hand, missing, warnings, raw_input} 写入
 * sessionStorage['quickEntryDraft']，本页读取后渲染概览。用户可：
 *   - 行内点 chip / card-slot 改字段
 *   - 每条街点"✎ 编辑"展开 widgetRenderActionBuilder
 *   - 缺字段（missing[] 含其 data-field 路径）红笔波浪线提示
 *   - "保存并复盘" → POST /hands → 自动 /completions → analysis.html
 *   - "全部展开" → 把 state 写回 sessionStorage，跳 form.html?prefill=1
 */

var BLIND_PRESETS = ["0.5/1", "1/2", "2/5", "5/10", "10/25", "25/50"];

// state 形状与 form.js 完全一致，确保 widgets 直接复用
var state = {
  blind_level: "",
  blind_custom: false,
  table_type: "6max",
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

var missing = [];
var warnings = [];
var rawInput = "";

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

// ===== 加载草稿 =====

function loadDraft() {
  var raw;
  try { raw = sessionStorage.getItem("quickEntryDraft"); } catch (_) { raw = null; }
  if (!raw) {
    showToast("没有待确认草稿，回到首页");
    setTimeout(function () { window.location.href = "/poker/"; }, 800);
    return false;
  }
  var draft;
  try { draft = JSON.parse(raw); } catch (_) { return false; }
  var hand = draft.hand || {};
  missing = draft.missing || [];
  warnings = draft.warnings || [];
  rawInput = draft.raw_input || "";

  if (hand.blind_level) {
    state.blind_level = hand.blind_level;
    state.blind_custom = BLIND_PRESETS.indexOf(hand.blind_level) === -1;
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
  } else if (state.actions.flop.length > 0) {
    state.flop_open = true;
  }
  if (typeof hand.turn_card === "string" && hand.turn_card.length === 2) {
    state.turn_card = [hand.turn_card];
    state.turn_open = true;
  } else if (state.actions.turn.length > 0) {
    state.turn_open = true;
  }
  if (typeof hand.river_card === "string" && hand.river_card.length === 2) {
    state.river_card = [hand.river_card];
    state.river_open = true;
  } else if (state.actions.river.length > 0) {
    state.river_open = true;
  }
  if (hand.result_bb != null) state.result_bb = String(hand.result_bb);
  if (typeof hand.showdown_opp_cards === "string" && hand.showdown_opp_cards.length >= 4) {
    state.showdown_opp_cards = [hand.showdown_opp_cards.slice(0, 2), hand.showdown_opp_cards.slice(2, 4)];
  }
  if (typeof hand.opponent_notes === "string") state.opponent_notes = hand.opponent_notes;
  if (typeof hand.notes === "string") state.notes = hand.notes;

  state.played_at = new Date().toISOString().slice(0, 10);

  return true;
}

// ===== 渲染 =====

function renderTitle() {
  var hero = state.hero_position || "?";
  var cards = (state.hero_cards[0] || "?") + (state.hero_cards[1] || "?");
  $("confirmTitle").textContent = hero + " · " + cards;
}

function renderBlindChips() {
  var c = $("confirmBlindChips");
  c.innerHTML = "";
  var presets = BLIND_PRESETS.concat(["__custom__"]);
  presets.forEach(function (v) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = v === "__custom__" ? (state.blind_custom && state.blind_level ? state.blind_level : "自定义") : v;
    var active = v === "__custom__" ? state.blind_custom : (!state.blind_custom && state.blind_level === v);
    if (active) btn.classList.add("active");
    btn.addEventListener("click", function () {
      if (v === "__custom__") {
        var input = prompt("自定义盲注（如 3/6）", state.blind_custom ? state.blind_level : "");
        if (input && /^[\d.]+\/[\d.]+$/.test(input.trim())) {
          state.blind_custom = true;
          state.blind_level = input.trim();
        }
      } else {
        state.blind_custom = false;
        state.blind_level = v;
      }
      renderAll();
    });
    c.appendChild(btn);
  });
}

function renderTableSeg() {
  $$("#confirmTableSeg button").forEach(function (b) {
    b.classList.toggle("active", b.dataset.table === state.table_type);
    b.onclick = function () {
      state.table_type = b.dataset.table;
      renderAll();
    };
  });
}

function renderHero() {
  $("confirmHeroPos").textContent = state.hero_position || "—";
  $("confirmHeroPos").onclick = function () {
    // 位置切换：弹简单 prompt（重型 UI 让用户去 form.html 改）
    var input = prompt("Hero 位置（如 BTN、CO、SB）", state.hero_position || "");
    if (input && input.trim()) {
      state.hero_position = input.trim().toUpperCase();
      renderAll();
    }
  };
  var stackInput = $("confirmHeroStack");
  stackInput.value = state.hero_stack_bb;
  stackInput.oninput = function () { state.hero_stack_bb = stackInput.value; refreshValidity(); };
}

function renderOpponents() {
  var c = $("confirmOpponents");
  c.innerHTML = "";
  if (state.opponents.length === 0) {
    c.innerHTML = '<span style="color:var(--ink-faint);font-style:italic;">无对手记录（点"全部展开"补充）</span>';
    return;
  }
  state.opponents.forEach(function (opp, idx) {
    var row = document.createElement("span");
    row.className = "confirm-opp-pill";
    row.setAttribute("data-field", "opponents[" + idx + "].stack_bb");
    row.innerHTML =
      '<span class="confirm-pos-tag">' + opp.position + '</span>' +
      '<input type="number" min="1" step="0.5" placeholder="—" value="' + (opp.stack_bb || "") + '" />' +
      '<span style="font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);">BB</span>';
    row.querySelector("input").addEventListener("input", function (e) {
      state.opponents[idx].stack_bb = e.target.value;
    });
    c.appendChild(row);
  });
}

function renderCardSlots() {
  $$(".card-slot").forEach(function (btn) {
    var slot = targetSlot(btn.dataset.target);
    widgetRenderCardSlot(btn, slot.arr[slot.idx]);
  });
}

function streetSummaryText(arr) {
  if (!arr || arr.length === 0) return "（未识别到行动）";
  return arr.map(function (a) {
    var t = a.position + " " + a.action;
    if (a.amount != null) t += " " + a.amount;
    return t;
  }).join(" · ");
}

function renderStreetCards() {
  ["preflop", "flop", "turn", "river"].forEach(function (s) {
    var card = $("card" + s.charAt(0).toUpperCase() + s.slice(1));
    if (!card) return;
    if (s !== "preflop") {
      var open = state[s + "_open"];
      card.hidden = !open;
      if (!open) return;
    }
    var summary = card.querySelector(".street-summary");
    summary.textContent = streetSummaryText(state.actions[s]);
    var builder = card.querySelector(".street-builder");
    builder.hidden = true;
    var toggle = card.querySelector(".street-edit-toggle");
    toggle.textContent = "✎ 编辑";
    toggle.onclick = function () {
      if (builder.hidden) {
        summary.hidden = true;
        builder.hidden = false;
        toggle.textContent = "✓ 完成";
        widgetRenderActionBuilder({
          container: builder, state: state, street: s,
          onChange: function () { /* 实时改 state，无需重渲整页 */ },
        });
      } else {
        summary.hidden = false;
        builder.hidden = true;
        toggle.textContent = "✎ 编辑";
        summary.textContent = streetSummaryText(state.actions[s]);
        refreshValidity();
      }
    };
  });
}

function renderResult() {
  $("confirmResultBB").value = state.result_bb;
  $("confirmResultBB").oninput = function (e) { state.result_bb = e.target.value; };
  $$(".result-sign").forEach(function (btn) {
    btn.onclick = function () {
      var sign = parseInt(btn.dataset.sign, 10);
      var input = $("confirmResultBB");
      var v = parseFloat(input.value);
      if (isNaN(v) || v === 0) { input.focus(); return; }
      input.value = (sign * Math.abs(v)).toString();
      state.result_bb = input.value;
    };
  });
  $("confirmOppClear").onclick = function () {
    state.showdown_opp_cards = [null, null];
    renderCardSlots();
  };
  $("confirmNotes").value = state.notes || "";
  $("confirmNotes").oninput = function (e) { state.notes = e.target.value; };
}

function renderRawInput() {
  $("rawContent").textContent = rawInput || "（无原文）";
  $("rawToggle").onclick = function () {
    var content = $("rawContent");
    if (content.hidden) {
      content.hidden = false;
      $("rawToggle").textContent = "收起 ↑";
    } else {
      content.hidden = true;
      $("rawToggle").textContent = "展开 ↓";
    }
  };
}

function renderWarnings() {
  var strip = $("warningStrip");
  if (warnings.length === 0) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  strip.innerHTML = warnings.map(function (w) { return "<div>⚠ " + w + "</div>"; }).join("");
}

// ===== 缺字段红笔波浪线 =====

function applyMissingHighlights() {
  // 先清旧高亮
  $$("[data-field].missing").forEach(function (el) { el.classList.remove("missing"); });
  // 按 missing 数组里的字段路径标记
  missing.forEach(function (key) {
    var el = document.querySelector('[data-field="' + cssEscape(key) + '"]');
    if (el) el.classList.add("missing");
  });
}

function cssEscape(str) {
  return String(str).replace(/(["\\\[\]\.])/g, "\\$1");
}

// ===== 保存按钮校验 =====

function isValidForSave() {
  if (!state.blind_level) return false;
  if (!state.hero_position) return false;
  if (!state.hero_cards[0] || !state.hero_cards[1]) return false;
  if (state.actions.preflop.length === 0) return false;
  return true;
}

function refreshValidity() {
  $("saveBtn").disabled = !isValidForSave();
  // 重新计算 missing 中的真实剩余项
  var realMissing = [];
  if (!state.blind_level) realMissing.push("blind_level");
  if (!state.hero_position) realMissing.push("hero_position");
  if (!state.hero_cards[0] || !state.hero_cards[1]) realMissing.push("hero_cards");
  if (!state.hero_stack_bb) realMissing.push("effective_stack_bb");
  if (!state.result_bb) realMissing.push("result_bb");
  state.opponents.forEach(function (o, i) {
    if (!o.stack_bb) realMissing.push("opponents[" + i + "].stack_bb");
  });
  missing = realMissing;
  applyMissingHighlights();
}

function renderAll() {
  renderTitle();
  renderBlindChips();
  renderTableSeg();
  renderHero();
  renderOpponents();
  renderCardSlots();
  renderStreetCards();
  renderResult();
  renderRawInput();
  renderWarnings();
  refreshValidity();
}

// ===== 选牌点击 =====

function bindCardSlotClicks() {
  $$(".card-slot").forEach(function (btn) {
    btn.addEventListener("click", function () {
      widgetOpenCardPicker(btn.dataset.target);
    });
  });
}

// ===== 保存 =====

function serializeActionsToText(arr) {
  if (!arr || arr.length === 0) return "";
  return arr.map(function (a) {
    var t = a.position + " " + a.action;
    if (a.amount != null) t += " " + a.amount;
    return t;
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
  var actions = { preflop: state.actions.preflop.filter(function (a) { return a.action; }) };
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
    opponent_notes: (state.opponent_notes || "").trim() || null,
    notes: (state.notes || "").trim() || null,
    played_at: state.played_at || null,
    raw_input: rawInput || null,
  };
}

async function save() {
  if (!isValidForSave()) {
    showToast("补齐红笔标出的字段才能开始");
    return;
  }
  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);
  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    return;
  }
  var btn = $("saveBtn");
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
    // sessionStorage 清掉，避免回退/刷新再次提示
    try { sessionStorage.removeItem("quickEntryDraft"); } catch (_) {}
    window.location.href = "/poker/analysis.html?hand_id=" + data.hand_id + "&auto=1";
  } catch (e) {
    showToast(e.message || "保存失败，请重试");
    btn.disabled = false;
    btn.textContent = "保存并复盘 →";
  }
}

// ===== "全部展开" → 跳 form.html?prefill=1 =====

function expandToForm() {
  // 把当前 state 重新打包到 sessionStorage（保留用户在 confirm 页的修改）
  var hand = buildPayload();
  hand.effective_stack_bb = state.hero_stack_bb !== "" ? parseFloat(state.hero_stack_bb) : null;
  sessionStorage.setItem("quickEntryDraft", JSON.stringify({
    hand: hand,
    missing: missing,
    warnings: warnings,
    raw_input: rawInput,
  }));
  window.location.href = "/poker/form.html?prefill=1";
}

// ===== 初始化 =====

(function init() {
  if (!loadDraft()) return;

  widgetInitCardPicker({
    state: state,
    onPick: function (target, card) {
      var slot = targetSlot(target);
      slot.arr[slot.idx] = card;
      renderCardSlots();
      renderTitle();
      refreshValidity();
    },
    autoAdvance: function (prevTarget) {
      if (prevTarget === "hero:0" && !state.hero_cards[1]) return "hero:1";
      if (prevTarget === "flop:0" && !state.flop_cards[1]) return "flop:1";
      if (prevTarget === "flop:1" && !state.flop_cards[2]) return "flop:2";
      if (prevTarget === "opp:0"  && !state.showdown_opp_cards[1]) return "opp:1";
      return null;
    },
  });

  bindCardSlotClicks();
  renderAll();

  $("saveBtn").addEventListener("click", save);
  $("expandToForm").addEventListener("click", expandToForm);
  $("cancelBtn").addEventListener("click", function () {
    try { sessionStorage.removeItem("quickEntryDraft"); } catch (_) {}
    window.location.href = "/poker/";
  });
}());
