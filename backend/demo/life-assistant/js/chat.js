(function () {
  var chatMessages = document.getElementById("chatMessages");
  var micBtn = document.getElementById("micBtn");
  var micHint = document.getElementById("micHint");
  var chatInput = document.getElementById("chatInput");
  var sendBtn = document.getElementById("sendBtn");
  var profileBadge = document.getElementById("profileBadge");
  var toastEl = document.getElementById("toast");

  var isWaitingLLM = false;
  var confirmedText = "";
  var pendingUserText = ""; // 当次用户输入，仅此内容传递给模型
  var recordingMsgEl = null;
  var thinkingMsgEl = null;
  var thinkingStepCount = 0; // 当前 thinking 中的工具调用步数

  // 技能名称映射（用于展示）
  var SKILL_LABELS = {
    record_expense: "记录支出",
    record_food: "记录食物",
  };

  // ===== 初始化 =====
  function init() {
    checkApiKey();
    loadHistory();
    showWelcome();
    micBtn.addEventListener("click", toggleRecording);
    sendBtn.addEventListener("click", handleSendText);
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        handleSendText();
      }
    });
  }

  // ===== 文字输入发送 =====
  function handleSendText() {
    if (isWaitingLLM) return;
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    addMessage("user", text);
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

  // ===== 消息渲染 =====
  function addMessage(role, content, save) {
    var div = document.createElement("div");
    div.className = "chat-msg--" + role;

    if (role === "assistant") {
      div.innerHTML = formatAssistantContent(content);
    } else {
      div.textContent = content;
    }

    chatMessages.appendChild(div);
    scrollToBottom();

    if (save !== false) {
      var history = getChatHistory();
      history.push({ role: role, content: content, time: new Date().toISOString() });
      saveChatHistory(history);
    }

    return div;
  }

  function addSystemMessage(text) {
    var div = document.createElement("div");
    div.className = "chat-msg--system";
    div.textContent = text;
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function addErrorMessage(text) {
    var div = document.createElement("div");
    div.className = "chat-msg--error";
    div.textContent = "[ERROR] " + text;
    chatMessages.appendChild(div);
    scrollToBottom();
  }

  function formatAssistantContent(content) {
    // 简单的 markdown 格式化：加粗、换行
    var html = escapeHtml(content);
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function scrollToBottom() {
    requestAnimationFrame(function () {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  }

  // ===== 欢迎消息 =====
  function showWelcome() {
    var history = getChatHistory();
    if (history.length > 0) return;

    addSystemMessage("> [LINK VERIFIED]");

    var profile = getProfile();
    var greeting = profile.name
      ? profile.name + "，你好！我是光明助理，有什么可以帮你的？"
      : "你好！我是光明助理，有什么可以帮你的？";

    typeMessage(greeting);
  }

  function typeMessage(text) {
    var div = document.createElement("div");
    div.className = "chat-msg--assistant";
    chatMessages.appendChild(div);

    var i = 0;
    function typeNext() {
      if (i < text.length) {
        div.innerHTML = formatAssistantContent(text.substring(0, i + 1));
        i++;
        scrollToBottom();
        setTimeout(typeNext, 30 + Math.random() * 20);
      } else {
        // 保存欢迎消息到历史
        var history = getChatHistory();
        history.push({ role: "assistant", content: text, time: new Date().toISOString() });
        saveChatHistory(history);
      }
    }
    typeNext();
  }

  // ===== 加载历史记录 =====
  function loadHistory() {
    var history = getChatHistory();
    if (history.length === 0) return;

    addSystemMessage("> [LINK VERIFIED]");

    history.forEach(function (msg) {
      addMessage(msg.role, msg.content, false);
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
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);

    // ASR 始终需要千问 key
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

    // 创建临时录音消息气泡
    recordingMsgEl = document.createElement("div");
    recordingMsgEl.className = "chat-msg--recording";
    recordingMsgEl.innerHTML = '<span class="recording-dot"></span>正在聆听...';
    chatMessages.appendChild(recordingMsgEl);
    scrollToBottom();

    ASR.start(qwenKey, {
      onRecording: function () {},
      onTranscript: function (text) {
        // 中间结果
        if (recordingMsgEl) {
          var display = confirmedText + text;
          if (display) {
            recordingMsgEl.innerHTML = '<span class="recording-dot"></span>' + escapeHtml(display);
          }
          scrollToBottom();
        }
      },
      onFinalResult: function (text) {
        // 最终确认结果
        confirmedText += text;
        if (recordingMsgEl && confirmedText) {
          recordingMsgEl.innerHTML = '<span class="recording-dot"></span>' + escapeHtml(confirmedText);
          scrollToBottom();
        }
      },
      onError: function (err) {
        ASR.stop();
        addErrorMessage(err);
        resetRecordingUI();
        // 移除录音气泡
        if (recordingMsgEl) {
          recordingMsgEl.remove();
          recordingMsgEl = null;
        }
      },
    });
  }

  function stopRecording() {
    ASR.stop();
    resetRecordingUI();

    var text = confirmedText.trim();

    // 移除临时录音气泡
    if (recordingMsgEl) {
      recordingMsgEl.remove();
      recordingMsgEl = null;
    }

    if (!text) {
      addSystemMessage("> 未检测到语音内容");
      return;
    }

    // 添加用户消息并调用 LLM
    addMessage("user", text);
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
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
    return events;
  }

  // ===== 思考步骤展示（可折叠日志面板） =====
  function createThinkingBubble() {
    thinkingStepCount = 0;
    thinkingMsgEl = document.createElement("div");
    thinkingMsgEl.className = "chat-msg--thinking";
    thinkingMsgEl.innerHTML =
      '<span class="thinking-dots"><span></span><span></span><span></span></span> 正在思考...';
    chatMessages.appendChild(thinkingMsgEl);
    scrollToBottom();
  }

  function showThinkingStep(event) {
    if (!thinkingMsgEl) return;
    // 首次收到 thinking 事件，清空默认的"正在思考..."
    var dots = thinkingMsgEl.querySelector(".thinking-dots");
    if (dots) {
      thinkingMsgEl.innerHTML = "";
    }

    // 添加轮次标题
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

      // 摘要行 + 详情区域（入参和结果）
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
    scrollToBottom();
  }

  function formatToolCallDesc(name, args) {
    if (name === "record_expense") {
      return (args.description || "") + " ¥" + (args.amount || "");
    } else if (name === "record_food") {
      return (args.food_name || "") + "（" + (args.meal_type || "") + "）";
    }
    return JSON.stringify(args);
  }

  function showToolResult(event) {
    if (!thinkingMsgEl) return;
    // 找到对应的 step 元素，更新状态
    var steps = thinkingMsgEl.querySelectorAll('.thinking-step[data-tool="' + event.name + '"]');
    for (var i = 0; i < steps.length; i++) {
      var statusEl = steps[i].querySelector(".thinking-status");
      if (statusEl && statusEl.textContent === "...") {
        // 更新状态标签（含耗时）
        var durationStr = event.duration != null ? " " + event.duration + "ms" : "";
        if (event.result && event.result.success) {
          statusEl.textContent = "[OK]" + durationStr;
          statusEl.classList.add("done");
        } else {
          statusEl.textContent = "[FAIL]" + durationStr;
          statusEl.classList.add("fail");
        }
        // 填充完整返回结果
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
    scrollToBottom();
  }

  // 将 thinking 气泡转为可折叠日志（不删除）
  function collapseThinking() {
    if (!thinkingMsgEl) return;

    // 如果没有任何工具调用步骤，直接移除（纯对话场景）
    if (thinkingStepCount === 0) {
      thinkingMsgEl.remove();
      thinkingMsgEl = null;
      return;
    }

    // 添加摘要行并折叠
    var summary = document.createElement("div");
    summary.className = "thinking-summary";
    summary.innerHTML = '<span class="thinking-icon">&gt;</span> Agent 执行日志（' + thinkingStepCount + ' 步）<span class="thinking-toggle">展开</span>';
    summary.addEventListener("click", function () {
      thinkingMsgEl.classList.toggle("collapsed");
      var toggleEl = summary.querySelector(".thinking-toggle");
      if (toggleEl) {
        toggleEl.textContent = thinkingMsgEl.classList.contains("collapsed") ? "展开" : "收起";
      }
      scrollToBottom();
    });

    thinkingMsgEl.insertBefore(summary, thinkingMsgEl.firstChild);
    thinkingMsgEl.classList.add("collapsed");
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

    // 显示思考气泡
    createThinkingBubble();

    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);
    var profile = getProfile();

    if (!apiKey) {
      removeThinking();
      addErrorMessage("缺少 API Key，请在个人资料页配置");
      profileBadge.classList.add("show");
      finishLLM();
      return;
    }

    // 仅将当次用户输入传递给模型
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
          // 非 SSE 错误响应
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
              // 流结束
              finishLLM();
              return;
            }

            buffer += decoder.decode(result.value, { stream: true });
            // 按双换行分割完整的 SSE 消息
            var parts = buffer.split("\n\n");
            // 最后一个可能不完整，保留在 buffer
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
            addErrorMessage("读取响应流失败: " + err.message);
            finishLLM();
          });
        }

        readChunk();
      })
      .catch(function (err) {
        removeThinking();
        addErrorMessage(err.message);
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
        addErrorMessage(event.message || "未知错误");
        finishLLM();
        break;
      case "done":
        // 流结束标记，finishLLM 由 reader.done 触发
        break;
    }
  }

  // 错误场景下直接移除 thinking 气泡
  function removeThinking() {
    if (thinkingMsgEl) {
      thinkingMsgEl.remove();
      thinkingMsgEl = null;
    }
  }

  function typeAssistantReply(text) {
    var div = document.createElement("div");
    div.className = "chat-msg--assistant";
    chatMessages.appendChild(div);

    var i = 0;
    function typeNext() {
      if (i < text.length) {
        div.innerHTML = formatAssistantContent(text.substring(0, i + 1));
        i++;
        scrollToBottom();
        setTimeout(typeNext, 20 + Math.random() * 15);
      } else {
        // 保存到历史
        var history = getChatHistory();
        history.push({ role: "assistant", content: text, time: new Date().toISOString() });
        saveChatHistory(history);
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
