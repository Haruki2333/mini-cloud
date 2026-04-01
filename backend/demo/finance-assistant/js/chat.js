(function () {
  var homeContent = document.getElementById("homeContent");
  var thinkingArea = document.getElementById("thinkingArea");
  var assistantReply = document.getElementById("assistantReply");
  var chatInput = document.getElementById("chatInput");
  var sendBtn = document.getElementById("sendBtn");
  var profileBadge = document.getElementById("profileBadge");
  var toastEl = document.getElementById("toast");
  var dateInput = document.getElementById("dateInput");

  var totalExpenseEl = document.getElementById("totalExpense");
  var totalIncomeEl = document.getElementById("totalIncome");
  var netIncomeEl = document.getElementById("netIncome");

  var isWaitingLLM = false;
  var pendingUserText = "";
  var thinkingMsgEl = null;
  var thinkingStepCount = 0;

  var SKILL_LABELS = {
    record: "记录",
    query: "查询",
  };

  // ===== 初始化 =====
  function init() {
    checkApiKey();
    showWelcome();
    initDatePicker();
    refreshData();
    bindSummaryClicks();

    sendBtn.addEventListener("click", handleSendText);
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        handleSendText();
      }
    });
  }

  // ===== 月份选择器 =====
  function initDatePicker() {
    dateInput.value = new Date().toISOString().slice(0, 7);
    dateInput.addEventListener("change", function () {
      refreshData();
    });
  }

  // ===== 摘要格点击（跳转详情页） =====
  function bindSummaryClicks() {
    var items = document.querySelectorAll(".summary-item--clickable");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function () {
        var type = this.getAttribute("data-type");
        var month = dateInput.value;
        window.location.href = "detail.html?type=" + type + "&month=" + month;
      });
    }
  }

  // ===== 数据刷新 =====
  function refreshData() {
    var month = dateInput.value;
    if (!month) return;

    var summary = getRecordsSummaryByMonth(month);
    if (summary.success) {
      totalExpenseEl.textContent = "¥" + (summary.expense.total || 0);
      totalIncomeEl.textContent = "¥" + (summary.income.total || 0);
      var net = summary.netIncome || 0;
      netIncomeEl.textContent = (net >= 0 ? "¥" : "-¥") + Math.abs(net);
    }
  }

  // ===== 文字输入发送 =====
  function handleSendText() {
    if (isWaitingLLM) return;
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    pendingUserText = text;
    sendToLLM();
  }

  function checkApiKey() {
    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var key = getApiKeyForModel(model);
    if (!key) {
      profileBadge.classList.add("show");
    } else {
      profileBadge.classList.remove("show");
    }
  }

  // ===== Toast =====
  var toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2500);
  }

  // ===== 欢迎消息 =====
  function showWelcome() {
    var profile = getProfile();
    var greeting = profile.name
      ? profile.name + "，你好！我是光明财务助理，可以帮你记账、分析收支。"
      : "你好！我是光明财务助理，可以帮你记账、分析收支。";

    assistantReply.classList.remove("assistant-reply--typing");
    assistantReply.innerHTML = formatAssistantContent(greeting);
  }

  function formatAssistantContent(content) {
    var html = escapeHtml(content);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function scrollToBottom() {
    requestAnimationFrame(function () {
      homeContent.scrollTop = homeContent.scrollHeight;
    });
  }

  // ===== SSE 解析 =====
  function parseSSEChunk(text) {
    var events = [];
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf("data: ") === 0) {
        var data = line.substring(6);
        if (data === "[DONE]") {
          events.push({ type: "done" });
        } else {
          try {
            events.push(JSON.parse(data));
          } catch (e) {}
        }
      }
    }
    return events;
  }

  // ===== 思考步骤展示 =====
  var LOADING_TEXTS = ["正在思考...", "正在分析...", "正在处理...", "正在生成回复..."];

  function createThinkingBubble() {
    thinkingStepCount = 0;
    thinkingArea.innerHTML = "";
    thinkingMsgEl = document.createElement("div");
    thinkingMsgEl.className = "chat-msg--thinking";
    thinkingMsgEl.innerHTML =
      '<span class="thinking-dots"><span></span><span></span><span></span></span> 正在思考...';
    thinkingArea.appendChild(thinkingMsgEl);
    scrollToBottom();
  }

  function showThinkingStep(event) {
    if (!thinkingMsgEl) return;
    var text = LOADING_TEXTS[Math.min(thinkingStepCount, LOADING_TEXTS.length - 1)];
    thinkingMsgEl.innerHTML =
      '<span class="thinking-dots"><span></span><span></span><span></span></span> ' + text;
    thinkingStepCount++;
    scrollToBottom();
  }

  function showToolResult(event) {
    // 将 record 工具的结果持久化到 localStorage
    if (event.name === "record" && event.result && event.result.success && event.result.results) {
      var results = event.result.results;
      for (var k = 0; k < results.length; k++) {
        if (results[k].success && results[k].record) {
          addRecord(results[k].type, results[k].record);
        }
      }
      refreshData();
    }
  }

  function collapseThinking() {
    thinkingArea.innerHTML = "";
    thinkingMsgEl = null;
  }

  function removeThinking() {
    thinkingArea.innerHTML = "";
    thinkingMsgEl = null;
  }

  // ===== LLM 调用（SSE 流式） =====
  function sendToLLM() {
    isWaitingLLM = true;
    sendBtn.style.opacity = "0.5";
    sendBtn.style.pointerEvents = "none";
    chatInput.disabled = true;

    // 清空上一条回复
    assistantReply.innerHTML = "";
    assistantReply.classList.remove("assistant-reply--typing");
    assistantReply.classList.add("assistant-reply--loading");
    createThinkingBubble();
    scrollToBottom();

    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);
    var profile = getProfile();
    profile.budgets = getAllRecords().budget || [];

    if (!apiKey) {
      removeThinking();
      assistantReply.innerHTML = '<span style="color:var(--color-danger)">[ERROR] 缺少 API Key，请在个人资料页配置</span>';
      profileBadge.classList.add("show");
      finishLLM();
      return;
    }

    var recent = [{ role: "user", content: pendingUserText }];

    fetch("/api/finance-chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        messages: recent,
        model: model,
        profile: profile,
      }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (data) {
            throw new Error(data.error || "请求失败 (" + res.status + ")");
          });
        }

        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function readChunk() {
          reader.read().then(function (result) {
            if (result.done) {
              finishLLM();
              return;
            }

            buffer += decoder.decode(result.value, { stream: true });
            var parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (var i = 0; i < parts.length; i++) {
              var events = parseSSEChunk(parts[i]);
              for (var j = 0; j < events.length; j++) {
                handleSSEEvent(events[j]);
              }
            }

            readChunk();
          }).catch(function (err) {
            removeThinking();
            assistantReply.innerHTML = '<span style="color:var(--color-danger)">[ERROR] 读取响应流失败: ' + escapeHtml(err.message) + '</span>';
            finishLLM();
          });
        }

        readChunk();
      })
      .catch(function (err) {
        removeThinking();
        assistantReply.innerHTML = '<span style="color:var(--color-danger)">[ERROR] ' + escapeHtml(err.message) + '</span>';
        finishLLM();
      });
  }

  function handleSSEEvent(event) {
    switch (event.type) {
      case "thinking":
        showThinkingStep(event);
        break;
      case "tool_result":
        showToolResult(event);
        break;
      case "answer":
        collapseThinking();
        if (event.content) {
          typeAssistantReply(event.content);
        } else {
          finishLLM();
        }
        break;
      case "error":
        removeThinking();
        assistantReply.innerHTML = '<span style="color:var(--color-danger)">[ERROR] ' + escapeHtml(event.message || "未知错误") + '</span>';
        finishLLM();
        break;
      case "done":
        break;
    }
  }

  function typeAssistantReply(text) {
    assistantReply.classList.add("assistant-reply--typing");
    assistantReply.innerHTML = "";

    var i = 0;
    function typeNext() {
      if (i < text.length) {
        assistantReply.innerHTML = formatAssistantContent(text.substring(0, i + 1));
        i++;
        setTimeout(typeNext, 20 + Math.random() * 15);
      } else {
        saveChatHistory([
          { role: "user", content: pendingUserText, time: new Date().toISOString() },
          { role: "assistant", content: text, time: new Date().toISOString() },
        ]);
        finishLLM();
      }
    }
    typeNext();
  }

  function finishLLM() {
    isWaitingLLM = false;
    assistantReply.classList.remove("assistant-reply--loading");
    sendBtn.style.opacity = "";
    sendBtn.style.pointerEvents = "";
    chatInput.disabled = false;
    chatInput.focus();
  }

  // 启动
  init();
})();
