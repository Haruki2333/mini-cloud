// ===== URL 参数 =====

var params = new URLSearchParams(location.search);
var HAND_ID = params.get("hand_id") ? parseInt(params.get("hand_id"), 10) : null;
var MODE = params.get("mode") || "hand";
var AUTO_ANALYZE = params.get("auto") === "1";

// ===== 聊天消息历史 =====

var chatMessages = [];
var leakChatMessages = [];
var isSending = false;

// ===== 初始化 =====

async function init() {
  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);

  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    setTimeout(function () { window.location.href = "/poker/profile.html"; }, 1500);
    return;
  }

  if (MODE === "leaks") {
    document.getElementById("pageTitle").textContent = "Leak 分析";
    document.getElementById("mainArea").style.display = "none";
    document.getElementById("chatInputBar").style.display = "none";

    var leakArea = document.getElementById("leakArea");
    leakArea.style.display = "flex";
    document.getElementById("leakChatInputBar").style.display = "flex";
    await initLeakMode();
    return;
  }

  if (!HAND_ID) {
    showToast("参数错误");
    return;
  }

  await loadHand();
}

// ===== 手牌分析模式 =====

async function loadHand() {
  try {
    var resp = await fetch("/api/poker/hands/" + HAND_ID, {
      headers: buildHeaders(),
    });
    if (!resp.ok) throw new Error("加载失败");
    var hand = await resp.json();
    renderHandSummary(hand);
    renderExistingAnalyses(hand.analyses || []);

    // 为追问注入上下文：直接把手牌数据带给 LLM，省去工具调用
    if (hand.is_analyzed) {
      chatMessages = [
        { role: "user", content: "我正在复盘以下手牌，请基于这些信息回答我的追问。\n\n" + buildHandContext(hand) },
        { role: "assistant", content: "好的，我已了解这手牌的完整信息和分析结果，请问你想追问什么？" },
      ];
    }

    if (!hand.is_analyzed && AUTO_ANALYZE) {
      await startAnalysis();
    } else if (!hand.is_analyzed) {
      document.getElementById("analyzeButtonArea").style.display = "block";
    }
  } catch (e) {
    showToast("加载手牌失败");
  }
}

function renderHandSummary(hand) {
  document.getElementById("handSummaryCard").style.display = "block";
  var deleteBtn = document.getElementById("deleteHandBtn");
  if (deleteBtn) deleteBtn.style.display = "";

  var resultText = formatResultBB(hand.result_bb) || "—";
  var resultClass = getResultClass(hand.result_bb);

  document.getElementById("handSummaryGrid").innerHTML =
    '<div class="hand-summary-cell">' +
      '<div class="hand-summary-value">' + escHtml(hand.hero_cards) + "</div>" +
      '<div class="hand-summary-label">起手牌</div>' +
    "</div>" +
    '<div class="hand-summary-cell">' +
      '<div class="hand-summary-value">' + escHtml(hand.hero_position) + "</div>" +
      '<div class="hand-summary-label">位置</div>' +
    "</div>" +
    '<div class="hand-summary-cell">' +
      '<div class="hand-summary-value ' + resultClass + '">' + escHtml(resultText) + "</div>" +
      '<div class="hand-summary-label">结果</div>' +
    "</div>";

  var detail = [];
  if (hand.preflop_actions) {
    detail.push(streetBlock("翻前", null, hand.preflop_actions));
  }
  if (hand.flop_cards) {
    detail.push(streetBlock("翻牌", hand.flop_cards, hand.flop_actions));
  }
  if (hand.turn_card) {
    detail.push(streetBlock("转牌", hand.turn_card, hand.turn_actions));
  }
  if (hand.river_card) {
    detail.push(streetBlock("河牌", hand.river_card, hand.river_actions));
  }
  document.getElementById("streetDetail").innerHTML = detail.join("");
}

function streetBlock(label, board, actions) {
  var boardHtml = board
    ? '<div class="street-board">' + renderCardChips(board) + "</div>"
    : "";
  var actionsHtml = actions
    ? '<div class="street-actions">' + escHtml(actions) + "</div>"
    : "";
  return (
    '<div class="street-block">' +
      '<div class="street-label">' + label + "</div>" +
      boardHtml +
      actionsHtml +
    "</div>"
  );
}

function renderExistingAnalyses(analyses) {
  var section = document.getElementById("analysisSection");
  if (!analyses || analyses.length === 0) {
    section.innerHTML = "";
    return;
  }

  section.innerHTML = analyses.map(function (a) {
    return renderAnalysisCard(a);
  }).join("");

  showChatArea();
  showCompareButton();
  showReAnalyzeButton();
}

function renderAnalysisCard(a) {
  var ratingLabel = RATING_LABELS[a.rating] || a.rating;
  var streetLabel = STREET_LABELS[a.street] || a.street;
  var ratingClass = a.rating;

  var betterHtml = "";
  if (a.better_action) {
    betterHtml =
      '<div>' +
        '<div class="analysis-section-label">better line</div>' +
        '<div class="analysis-better-action">' +
          '<span style="color:var(--green);font-size:16px;">→</span>' +
          '<span>' + escHtml(a.better_action) + "</span>" +
        "</div>" +
      "</div>";
  }

  return (
    '<div class="analysis-card">' +
      '<div class="analysis-card-header">' +
        '<span class="analysis-street">' + streetLabel + "</span>" +
        '<span class="rating-badge ' + ratingClass + '">' + ratingLabel + "</span>" +
      "</div>" +
      '<div class="analysis-card-body">' +
        '<div>' +
          '<div class="analysis-section-label">scenario</div>' +
          '<div class="analysis-text">' + escHtml(a.scenario) + "</div>" +
          '<div class="analysis-hero-action" style="margin-top:8px;">Hero: ' + escHtml(a.hero_action) + "</div>" +
        "</div>" +
        betterHtml +
        '<div>' +
          '<div class="analysis-section-label" style="font-family:var(--font-hand);color:var(--red);font-size:17px;font-style:normal;">Coach\'s read —</div>' +
          '<div class="analysis-text">' + escHtml(a.reasoning) + "</div>" +
        "</div>" +
        '<div class="analysis-principle">' + escHtml(a.principle) + "</div>" +
      "</div>" +
    "</div>"
  );
}

function showChatArea() {
  document.getElementById("chatDivider").style.display = "block";
  document.getElementById("chatInputBar").style.display = "flex";
}

function showCompareButton() {
  var area = document.getElementById("compareButtonArea");
  var btn = document.getElementById("compareBtn");
  if (area && btn && HAND_ID) {
    btn.href = "/poker/compare.html?hand_id=" + HAND_ID;
    area.style.display = "block";
  }
}

function showReAnalyzeButton() {
  var area = document.getElementById("reAnalyzeButtonArea");
  if (area) area.style.display = "block";
}

async function reAnalyzeHand() {
  document.getElementById("reAnalyzeButtonArea").style.display = "none";
  document.getElementById("compareButtonArea").style.display = "none";
  document.getElementById("chatDivider").style.display = "none";
  document.getElementById("chatInputBar").style.display = "none";
  document.getElementById("chatMessages").innerHTML = "";
  chatMessages = [];
  await startAnalysis();
}

// ===== AI 分析 =====

async function startAnalysis() {
  document.getElementById("analyzeButtonArea").style.display = "none";

  var section = document.getElementById("analysisSection");
  section.innerHTML =
    '<div style="padding:20px 0;">' +
      '<div style="font-family:var(--font-hand);font-size:20px;color:var(--ink-soft);font-style:italic;">' +
        'coach is reading…' +
      '</div>' +
    '</div>';

  var initMsg = "请分析手牌 #" + HAND_ID + "，找出关键决策点并给出教练反馈。";
  chatMessages = [{ role: "user", content: initMsg }];

  await streamChat(chatMessages, function (answer) {
    fetch("/api/poker/hands/" + HAND_ID, { headers: buildHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (hand) {
        section.innerHTML = "";
        var analyses = hand.analyses || [];
        if (analyses.length > 0) {
          renderExistingAnalyses(analyses);
        } else if (answer) {
          // 兜底：模型未调用 save_analysis 时，仍把文字回复展示出来，避免界面空白
          section.innerHTML =
            '<div class="analysis-card"><div class="analysis-card-body">' +
              '<div class="analysis-section-label">coach 反馈</div>' +
              '<div class="analysis-text">' + nl2br(escHtml(answer)) + "</div>" +
            "</div></div>";
          document.getElementById("reAnalyzeButtonArea").style.display = "block";
          showChatArea();
        } else {
          section.innerHTML =
            '<div style="padding:16px;font-family:var(--font-hand);font-size:17px;color:var(--red);">分析未返回结果，请重试。</div>';
          document.getElementById("analyzeButtonArea").style.display = "block";
        }

        if (answer) {
          chatMessages.push({ role: "assistant", content: answer });
        }
      });
  }, function () {
    section.innerHTML =
      '<div style="padding:16px;font-family:var(--font-hand);font-size:17px;color:var(--red);">分析失败，请重试。</div>';
    document.getElementById("analyzeButtonArea").style.display = "block";
  }, { hand_id: HAND_ID });
}

// ===== 追问聊天 =====

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
}

async function sendChat() {
  var input = document.getElementById("chatInput");
  var text = input.value.trim();
  if (!text || isSending) return;

  input.value = "";
  input.style.height = "";

  chatMessages.push({ role: "user", content: text });
  appendChatBubble("user", text);

  var typingId = appendTyping();

  await streamChat(chatMessages, function (answer) {
    removeTyping(typingId);
    chatMessages.push({ role: "assistant", content: answer });
    appendChatBubble("assistant", answer);
  }, function () {
    removeTyping(typingId);
    showToast("发送失败，请重试");
  });
}

// ===== Leak 模式 =====

async function initLeakMode() {
  var topSection = document.getElementById("leakTopSection");

  try {
    var resp = await fetch("/api/poker/leaks", { headers: buildHeaders() });
    var data = await resp.json();
    var totalHands = data.total_hands || 0;

    if (totalHands < 10) {
      topSection.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">✕</div>' +
          '<div class="empty-title">手牌数量不足</div>' +
          '<div class="empty-desc">已录入 ' + totalHands + ' 手，需累计 10 手后才能分析 Leak</div>' +
        "</div>";
      return;
    }

    if (data.leaks && data.leaks.length > 0) {
      renderLeaks(data.leaks, topSection);
      showLeakChat();
    } else {
      await startLeakAnalysis(topSection);
    }
  } catch (e) {
    topSection.innerHTML =
      '<div style="padding:16px;font-family:var(--font-hand);font-size:17px;color:var(--red);">加载失败，请重试</div>';
  }
}

function renderLeaks(leaks, container) {
  container.innerHTML =
    '<div class="card">' +
      '<div class="card-header">' +
        '<span class="card-title">Leak 模式</span>' +
        '<button class="btn btn-sm btn-secondary" onclick="reAnalyzeLeaks()">重新分析</button>' +
      "</div>" +
      '<div id="leakList">' +
        leaks.map(function (l) {
          return (
            '<div class="leak-item">' +
              '<div class="leak-count">' + l.occurrences + "</div>" +
              '<div class="leak-pattern">' + escHtml(l.pattern) + "</div>" +
            "</div>"
          );
        }).join("") +
      "</div>" +
    "</div>";
}

async function startLeakAnalysis(container) {
  container.innerHTML =
    '<div style="padding:20px 0;">' +
      '<div style="font-family:var(--font-hand);font-size:20px;color:var(--ink-soft);font-style:italic;">' +
        'coach is reading your patterns…' +
      '</div>' +
    '</div>';

  var initMsg = "请分析我的历史手牌，识别我重复出现的 Leak 模式，并给出改进建议。";
  leakChatMessages = [{ role: "user", content: initMsg }];

  await streamLeakChat(leakChatMessages, function (answer) {
    fetch("/api/poker/leaks", { headers: buildHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.leaks && data.leaks.length > 0) {
          renderLeaks(data.leaks, container);
        } else {
          container.innerHTML = "";
        }
        if (answer) {
          leakChatMessages.push({ role: "assistant", content: answer });
          appendLeakBubble("assistant", answer);
          showLeakChat();
        }
      });
  }, function () {
    container.innerHTML =
      '<div style="padding:16px;font-family:var(--font-hand);font-size:17px;color:var(--red);">分析失败，请重试</div>';
  }, { analyze_leaks: true });
}

async function reAnalyzeLeaks() {
  var topSection = document.getElementById("leakTopSection");
  leakChatMessages = [];
  document.getElementById("leakChatMessages").innerHTML = "";
  await startLeakAnalysis(topSection);
}

function handleLeakKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendLeakChat();
  }
}

async function sendLeakChat() {
  var input = document.getElementById("leakChatInput");
  var text = input.value.trim();
  if (!text || isSending) return;

  input.value = "";
  leakChatMessages.push({ role: "user", content: text });
  appendLeakBubble("user", text);

  var typingId = appendLeakTyping();
  await streamLeakChat(leakChatMessages, function (answer) {
    removeLeakTyping(typingId);
    leakChatMessages.push({ role: "assistant", content: answer });
    appendLeakBubble("assistant", answer);
  }, function () {
    removeLeakTyping(typingId);
    showToast("发送失败");
  });
}

function showLeakChat() {
  document.getElementById("leakChatInputBar").style.display = "flex";
}

// ===== SSE 流式通用 =====

async function streamChat(messages, onDone, onError, extraBody) {
  var settings = getSettings();
  isSending = true;
  setSendBtn(false);

  try {
    var resp = await fetch("/api/poker/completions", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(Object.assign({ messages: messages, model: settings.model }, extraBody)),
    });

    if (!resp.ok) {
      var err = await resp.json();
      throw new Error(err.error || "请求失败");
    }

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var fullAnswer = "";

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith("data: ")) continue;
        var raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          var evt = JSON.parse(raw);
          if (evt.type === "answer") {
            fullAnswer = evt.content || "";
          }
        } catch (_) {}
      }
    }

    isSending = false;
    setSendBtn(true);
    onDone(fullAnswer);
  } catch (e) {
    isSending = false;
    setSendBtn(true);
    onError(e);
  }
}

async function streamLeakChat(messages, onDone, onError, extraBody) {
  var settings = getSettings();
  isSending = true;
  setLeakSendBtn(false);

  try {
    var resp = await fetch("/api/poker/completions", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(Object.assign({ messages: messages, model: settings.model }, extraBody)),
    });

    if (!resp.ok) throw new Error("请求失败");

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var fullAnswer = "";

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith("data: ")) continue;
        var raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try {
          var evt = JSON.parse(raw);
          if (evt.type === "answer") fullAnswer = evt.content || "";
        } catch (_) {}
      }
    }

    isSending = false;
    setLeakSendBtn(true);
    onDone(fullAnswer);
  } catch (e) {
    isSending = false;
    setLeakSendBtn(true);
    onError(e);
  }
}

// ===== DOM 工具 =====

function appendChatBubble(role, text) {
  var container = document.getElementById("chatMessages");
  var el = document.createElement("div");
  el.className = "chat-message " + role;
  el.innerHTML =
    '<div class="chat-bubble">' + nl2br(escHtml(text)) + "</div>";
  container.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

function appendLeakBubble(role, text) {
  var container = document.getElementById("leakChatMessages");
  var el = document.createElement("div");
  el.className = "chat-message " + role;
  el.innerHTML =
    '<div class="chat-bubble">' + nl2br(escHtml(text)) + "</div>";
  container.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

var _typingId = 0;

function appendTyping() {
  var id = ++_typingId;
  var container = document.getElementById("chatMessages");
  var el = document.createElement("div");
  el.className = "chat-message assistant";
  el.id = "typing-" + id;
  el.innerHTML = '<div class="typing-indicator">coach is reading…</div>';
  container.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return id;
}

function removeTyping(id) {
  var el = document.getElementById("typing-" + id);
  if (el) el.remove();
}

function appendLeakTyping() {
  var id = ++_typingId;
  var container = document.getElementById("leakChatMessages");
  var el = document.createElement("div");
  el.className = "chat-message assistant";
  el.id = "typing-" + id;
  el.innerHTML = '<div class="typing-indicator">coach is reading…</div>';
  container.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return id;
}

function removeLeakTyping(id) {
  var el = document.getElementById("typing-" + id);
  if (el) el.remove();
}

function setSendBtn(enabled) {
  var btn = document.getElementById("sendBtn");
  if (btn) btn.disabled = !enabled;
}

function setLeakSendBtn(enabled) {
  var btn = document.getElementById("leakSendBtn");
  if (btn) btn.disabled = !enabled;
}

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nl2br(str) {
  return str.replace(/\n/g, "<br>");
}

// ===== 手牌上下文序列化 =====

function buildHandContext(hand) {
  var lines = [];
  lines.push("手牌 #" + hand.id);
  lines.push("盲注: " + hand.blind_level);
  lines.push("位置: " + hand.hero_position);
  lines.push("起手牌: " + hand.hero_cards);
  if (hand.hero_stack_bb) lines.push("筹码: " + hand.hero_stack_bb + "BB");
  if (hand.result_bb != null) lines.push("结果: " + formatResultBB(hand.result_bb));
  if (hand.opponent_notes) lines.push("对手: " + hand.opponent_notes);

  if (hand.preflop_actions) lines.push("\n翻前行动: " + hand.preflop_actions);
  if (hand.flop_cards) {
    lines.push("\n翻牌: " + hand.flop_cards);
    if (hand.flop_actions) lines.push("翻牌行动: " + hand.flop_actions);
  }
  if (hand.turn_card) {
    lines.push("\n转牌: " + hand.turn_card);
    if (hand.turn_actions) lines.push("转牌行动: " + hand.turn_actions);
  }
  if (hand.river_card) {
    lines.push("\n河牌: " + hand.river_card);
    if (hand.river_actions) lines.push("河牌行动: " + hand.river_actions);
  }

  var analyses = hand.analyses || [];
  if (analyses.length > 0) {
    lines.push("\n--- 已有分析 ---");
    analyses.forEach(function (a) {
      var streetLabel = STREET_LABELS[a.street] || a.street;
      var ratingLabel = RATING_LABELS[a.rating] || a.rating;
      lines.push("\n[" + streetLabel + "] " + ratingLabel);
      lines.push("场景: " + a.scenario);
      lines.push("Hero操作: " + a.hero_action);
      if (a.better_action) lines.push("更优选择: " + a.better_action);
      lines.push("分析: " + a.reasoning);
      lines.push("原则: " + a.principle);
    });
  }

  return lines.join("\n");
}

// ===== 删除手牌 =====

async function confirmDeleteHand() {
  if (!HAND_ID) return;
  if (!confirm("确定要删除这手牌吗？此操作不可恢复。")) return;
  try {
    var resp = await fetch("/api/poker/hands/" + HAND_ID, {
      method: "DELETE",
      headers: buildHeaders(),
    });
    if (!resp.ok) throw new Error("删除失败");
    showToast("已删除，正在返回…");
    setTimeout(function () { window.location.href = "/poker/"; }, 1000);
  } catch (e) {
    showToast("删除失败，请重试");
  }
}

// ===== 启动 =====

init();
