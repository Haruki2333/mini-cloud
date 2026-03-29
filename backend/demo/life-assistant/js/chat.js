(function () {
  var homeContent = document.getElementById("homeContent");
  var thinkingArea = document.getElementById("thinkingArea");
  var assistantReply = document.getElementById("assistantReply");
  var micBtn = document.getElementById("micBtn");
  var micHint = document.getElementById("micHint");
  var chatInput = document.getElementById("chatInput");
  var sendBtn = document.getElementById("sendBtn");
  var profileBadge = document.getElementById("profileBadge");
  var toastEl = document.getElementById("toast");
  var dateInput = document.getElementById("dateInput");
  var summaryDetail = document.getElementById("summaryDetail");

  var totalExpenseEl = document.getElementById("totalExpense");
  var totalFoodEl = document.getElementById("totalFood");
  var totalTodoEl = document.getElementById("totalTodo");
  var totalInsightEl = document.getElementById("totalInsight");

  var isWaitingLLM = false;
  var confirmedText = "";
  var pendingUserText = "";
  var thinkingMsgEl = null;
  var thinkingStepCount = 0;
  var activeDetailType = null; // 当前展开的记录类型

  var SKILL_LABELS = {
    record: "记录",
  };

  var DETAIL_TITLES = {
    expense: "EXPENSE_LOG",
    food: "FOOD_LOG",
    todo: "TODO_LOG",
    insight: "INSIGHT_LOG",
  };

  // ===== 初始化 =====
  function init() {
    checkApiKey();
    showWelcome();
    initDatePicker();
    refreshData();
    bindSummaryClicks();

    micBtn.addEventListener("click", toggleRecording);
    sendBtn.addEventListener("click", handleSendText);
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        handleSendText();
      }
    });
  }

  // ===== 日期选择器 =====
  function initDatePicker() {
    dateInput.value = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener("change", function () {
      refreshData();
    });
  }

  // ===== 摘要格点击 =====
  function bindSummaryClicks() {
    var items = document.querySelectorAll(".summary-item--clickable");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function () {
        var type = this.getAttribute("data-type");
        toggleDetail(type);
      });
    }
  }

  function toggleDetail(type) {
    var items = document.querySelectorAll(".summary-item--clickable");

    if (activeDetailType === type) {
      // 收起
      activeDetailType = null;
      summaryDetail.innerHTML = "";
      for (var i = 0; i < items.length; i++) {
        items[i].classList.remove("active");
      }
      return;
    }

    activeDetailType = type;
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute("data-type") === type) {
        items[i].classList.add("active");
      } else {
        items[i].classList.remove("active");
      }
    }

    var date = dateInput.value;
    var records = getRecordsByDate(type, date);
    renderDetailList(type, records);
  }

  function renderDetailList(type, records) {
    if (records.length === 0) {
      summaryDetail.innerHTML =
        '<div class="summary-detail-inner">' +
          '<div class="summary-detail-title">' + DETAIL_TITLES[type] + '</div>' +
          '<div class="record-empty">&gt; 暂无记录</div>' +
        '</div>';
      return;
    }

    var maxShow = 5;
    var showRecords = records.slice(0, maxShow);
    var html = '<div class="summary-detail-inner">';
    html += '<div class="summary-detail-title">' + DETAIL_TITLES[type] + '</div>';

    for (var i = 0; i < showRecords.length; i++) {
      html += renderRecordItem(type, showRecords[i]);
    }

    if (records.length > maxShow) {
      html += '<a href="detail.html" class="record-more">查看全部 ' + records.length + ' 条记录 &rarr;</a>';
    }

    html += '</div>';
    summaryDetail.innerHTML = html;
  }

  function renderRecordItem(type, r) {
    switch (type) {
      case "expense":
        return '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.description || "") + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.category || "") + '</span>' +
          '<span class="record-amount">¥' + (r.amount || 0) + '</span>' +
        '</div>';
      case "food":
        return '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.food_name || "") + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.meal_type || "") + '</span>' +
        '</div>';
      case "todo":
        return '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.title || "") + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.priority || "") + '</span>' +
        '</div>';
      case "insight":
        var tagHtml = r.tag ? '<span class="record-tag">' + escapeHtml(r.tag) + '</span>' : '';
        return '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.content || "") + '</span>' +
          tagHtml +
        '</div>';
      default:
        return '';
    }
  }

  // ===== 数据刷新 =====
  function refreshData() {
    var date = dateInput.value;
    if (!date) return;

    var summary = getRecordsSummary(date);
    if (summary.success) {
      totalExpenseEl.textContent = "¥" + (summary.expense.total || 0);
      totalFoodEl.textContent = summary.food.count || 0;
      totalTodoEl.textContent = summary.todo.count || 0;
      totalInsightEl.textContent = summary.insight.count || 0;
    }

    // 如果有展开的记录面板，刷新它
    if (activeDetailType) {
      var records = getRecordsByDate(activeDetailType, date);
      renderDetailList(activeDetailType, records);
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
      ? profile.name + "，你好！我是光明助理，有什么可以帮你的？"
      : "你好！我是光明助理，有什么可以帮你的？";

    assistantReply.classList.remove("assistant-reply--typing");
    assistantReply.innerHTML = formatAssistantContent(greeting);
  }

  function formatAssistantContent(content) {
    var html = escapeHtml(content);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function scrollToTop() {
    requestAnimationFrame(function () {
      homeContent.scrollTop = 0;
    });
  }

  // ===== 录音控制 =====
  function toggleRecording() {
    if (isWaitingLLM) return;
    if (ASR.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    var settings = getSettings();
    var qwenKey = settings.apiKeys.qwen;
    if (!qwenKey) {
      showToast("请先在个人资料页配置千问 API Key");
      profileBadge.classList.add("show");
      return;
    }

    confirmedText = "";
    micBtn.classList.add("recording");
    micHint.style.display = "";
    micHint.innerHTML = "&gt; <span>录音中，再次点击结束</span>";

    ASR.start(qwenKey, {
      onRecording: function () {},
      onTranscript: function (text) {
        var display = confirmedText + text;
        if (display) {
          micHint.innerHTML = '&gt; <span class="recording-dot"></span> ' + escapeHtml(display);
        }
      },
      onFinalResult: function (text) {
        confirmedText += text;
        if (confirmedText) {
          micHint.innerHTML = '&gt; <span class="recording-dot"></span> ' + escapeHtml(confirmedText);
        }
      },
      onError: function (err) {
        ASR.stop();
        showToast(err);
        resetRecordingUI();
      },
    });
  }

  function stopRecording() {
    ASR.stop();
    resetRecordingUI();

    var text = confirmedText.trim();
    if (!text) {
      showToast("未检测到语音内容");
      return;
    }

    pendingUserText = text;
    sendToLLM();
  }

  function resetRecordingUI() {
    micBtn.classList.remove("recording");
    micHint.style.display = "none";
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
  function createThinkingBubble() {
    thinkingStepCount = 0;
    thinkingArea.innerHTML = "";
    thinkingMsgEl = document.createElement("div");
    thinkingMsgEl.className = "chat-msg--thinking";
    thinkingMsgEl.innerHTML =
      '<span class="thinking-dots"><span></span><span></span><span></span></span> 正在思考...';
    thinkingArea.appendChild(thinkingMsgEl);
    scrollToTop();
  }

  function showThinkingStep(event) {
    if (!thinkingMsgEl) return;
    var dots = thinkingMsgEl.querySelector(".thinking-dots");
    if (dots) {
      thinkingMsgEl.innerHTML = "";
    }

    if (event.iteration) {
      var roundEl = document.createElement("div");
      roundEl.className = "thinking-round";
      roundEl.textContent = "轮次 " + event.iteration + "/" + event.maxIterations;
      thinkingMsgEl.appendChild(roundEl);
    }

    var toolCalls = event.tool_calls || [];
    for (var i = 0; i < toolCalls.length; i++) {
      var tc = toolCalls[i];
      var label = SKILL_LABELS[tc.name] || tc.name;
      var args = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch (e) {}

      var desc = formatToolCallDesc(tc.name, args);
      var step = document.createElement("div");
      step.className = "thinking-step";
      step.setAttribute("data-tool", tc.name);

      step.innerHTML =
        '<div class="thinking-step-header">' +
          '<span class="thinking-icon">&gt;</span> ' +
          escapeHtml(label + ": " + desc) +
          '<span class="thinking-status">...</span>' +
        '</div>' +
        '<div class="thinking-step-detail">' +
          '<div class="detail-section">' +
            '<span class="detail-label">入参</span>' +
            '<pre class="detail-pre">' + escapeHtml(JSON.stringify(args, null, 2)) + '</pre>' +
          '</div>' +
          '<div class="detail-section detail-result-section"></div>' +
        '</div>';

      thinkingMsgEl.appendChild(step);
      thinkingStepCount++;
    }
    scrollToTop();
  }

  function formatToolCallDesc(name, args) {
    if (name === "record" && args.records) {
      var descs = [];
      for (var i = 0; i < args.records.length; i++) {
        var r = args.records[i];
        switch (r.type) {
          case "expense":
            descs.push((r.description || "") + " ¥" + (r.amount || ""));
            break;
          case "food":
            descs.push((r.food_name || "") + "（" + (r.meal_type || "") + "）");
            break;
          case "todo":
            var p = r.priority ? "（" + r.priority + "）" : "";
            descs.push((r.title || "") + p);
            break;
          case "insight":
            var tag = r.tag ? "（" + r.tag + "）" : "";
            descs.push((r.content || "").substring(0, 30) + tag);
            break;
        }
      }
      return descs.join("；");
    }
    return JSON.stringify(args);
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
      // 刷新数据面板
      refreshData();
    }

    if (!thinkingMsgEl) return;
    var steps = thinkingMsgEl.querySelectorAll('.thinking-step[data-tool="' + event.name + '"]');
    for (var i = 0; i < steps.length; i++) {
      var statusEl = steps[i].querySelector(".thinking-status");
      if (statusEl && statusEl.textContent === "...") {
        var durationStr = event.duration != null ? " " + event.duration + "ms" : "";
        if (event.result && event.result.success) {
          statusEl.textContent = "[OK]" + durationStr;
          statusEl.classList.add("done");
        } else {
          statusEl.textContent = "[FAIL]" + durationStr;
          statusEl.classList.add("fail");
        }
        var resultSection = steps[i].querySelector(".detail-result-section");
        if (resultSection && event.result) {
          resultSection.innerHTML =
            '<span class="detail-label">结果</span>' +
            '<pre class="detail-pre">' +
            escapeHtml(JSON.stringify(event.result, null, 2)) +
            '</pre>';
        }
        break;
      }
    }
    scrollToTop();
  }

  function collapseThinking() {
    if (!thinkingMsgEl) return;
    var msgEl = thinkingMsgEl;

    if (thinkingStepCount === 0) {
      thinkingArea.innerHTML = "";
      thinkingMsgEl = null;
      return;
    }

    var summary = document.createElement("div");
    summary.className = "thinking-summary";
    summary.innerHTML = '<span class="thinking-icon">&gt;</span> Agent 执行日志（' + thinkingStepCount + ' 步）<span class="thinking-toggle">展开</span>';
    summary.addEventListener("click", function () {
      msgEl.classList.toggle("collapsed");
      var toggleEl = summary.querySelector(".thinking-toggle");
      if (toggleEl) {
        toggleEl.textContent = msgEl.classList.contains("collapsed") ? "展开" : "收起";
      }
    });

    msgEl.insertBefore(summary, msgEl.firstChild);
    msgEl.classList.add("collapsed");
    thinkingMsgEl = null;
  }

  function removeThinking() {
    thinkingArea.innerHTML = "";
    thinkingMsgEl = null;
  }

  // ===== LLM 调用（SSE 流式） =====
  function sendToLLM() {
    isWaitingLLM = true;
    micBtn.style.opacity = "0.5";
    micBtn.style.pointerEvents = "none";
    sendBtn.style.opacity = "0.5";
    sendBtn.style.pointerEvents = "none";
    chatInput.disabled = true;

    // 清空上一条回复
    assistantReply.innerHTML = "";
    assistantReply.classList.remove("assistant-reply--typing");
    createThinkingBubble();
    scrollToTop();

    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);
    var profile = getProfile();

    if (!apiKey) {
      removeThinking();
      assistantReply.innerHTML = '<span style="color:var(--color-danger)">[ERROR] 缺少 API Key，请在个人资料页配置</span>';
      profileBadge.classList.add("show");
      finishLLM();
      return;
    }

    var recent = [{ role: "user", content: pendingUserText }];

    fetch("/api/chat/completions", {
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
        // 保存到聊天历史（仅保留最新一条，方便刷新后显示）
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
    micBtn.style.opacity = "";
    micBtn.style.pointerEvents = "";
    sendBtn.style.opacity = "";
    sendBtn.style.pointerEvents = "";
    chatInput.disabled = false;
    chatInput.focus();
  }

  // 启动
  init();
})();
