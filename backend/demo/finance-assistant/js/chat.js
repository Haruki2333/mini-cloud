(function () {
  var homeContent = document.getElementById("homeContent");
  var thinkingArea = document.getElementById("thinkingArea");
  var chatInput = document.getElementById("chatInput");
  var sendBtn = document.getElementById("sendBtn");
  var profileBadge = document.getElementById("profileBadge");
  var toastEl = document.getElementById("toast");
  var dateInput = document.getElementById("dateInput");
  var fabBtn = document.getElementById("fabBtn");
  var inputOverlay = document.getElementById("inputOverlay");
  var inputOverlayBackdrop = document.getElementById("inputOverlayBackdrop");
  var inputOverlayClose = document.getElementById("inputOverlayClose");
  var thinkingOverlay = document.getElementById("thinkingOverlay");
  var thinkingUserEchoEl = document.getElementById("thinkingUserEcho");
  var thinkingStatusDotEl = document.getElementById("thinkingStatusDot");
  var expenseChartEl = document.getElementById("expenseChart");

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
    update_profile: "更新资料",
  };

  // ===== 初始化 =====
  function init() {
    checkApiKey();
    initDatePicker();
    refreshData();
    bindSummaryClicks();

    fabBtn.addEventListener("click", openInputOverlay);
    inputOverlayClose.addEventListener("click", closeInputOverlay);
    inputOverlayBackdrop.addEventListener("click", closeInputOverlay);

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

  // ===== 数据刷新（从数据库读取） =====
  function refreshData() {
    var month = dateInput.value;
    if (!month) return;

    fetch("/api/finance-chat/data/summary?month=" + month, {
      headers: { "X-Anon-Token": getOrCreateAnonToken() },
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) return;
        totalExpenseEl.textContent = "¥" + (data.expense.total || 0);
        totalIncomeEl.textContent = "¥" + (data.income.total || 0);
        var net = data.netIncome || 0;
        netIncomeEl.textContent = (net >= 0 ? "¥" : "-¥") + Math.abs(net);
        renderExpenseChart(data.expense.byCategory || {});
      })
      .catch(function (err) {
        console.error("获取月度摘要失败:", err);
      });
  }

  // ===== 支出分类柱状图 =====
  function renderExpenseChart(byCategory) {
    var cats = Object.keys(byCategory);

    if (cats.length === 0) {
      expenseChartEl.innerHTML = '<div class="expense-chart-empty">暂无支出数据</div>';
      return;
    }

    cats.sort(function (a, b) { return byCategory[b] - byCategory[a]; });
    var max = byCategory[cats[0]];

    var html = cats.map(function (cat) {
      var amt = byCategory[cat];
      var pct = max > 0 ? Math.round(amt / max * 100) : 0;
      return (
        '<div class="expense-bar-row">' +
          '<span class="expense-bar-label">' + escapeHtml(cat) + '</span>' +
          '<div class="expense-bar-track">' +
            '<div class="expense-bar-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<span class="expense-bar-amount">¥' + amt + '</span>' +
        '</div>'
      );
    }).join("");

    expenseChartEl.innerHTML = html;

    // 触发 CSS 动画：先将宽度置 0，再设置目标宽度
    requestAnimationFrame(function () {
      var fills = expenseChartEl.querySelectorAll(".expense-bar-fill");
      for (var i = 0; i < fills.length; i++) {
        fills[i].style.width = fills[i].style.width; // 读取，强制布局
      }
    });
  }

  // ===== 输入浮层 =====
  function openInputOverlay() {
    if (isWaitingLLM) return;
    inputOverlay.classList.add("open");
    // iOS 要求 focus() 必须在用户手势的同步调用栈内执行，否则键盘无法弹出
    chatInput.focus();
  }

  function closeInputOverlay() {
    inputOverlay.classList.remove("open");
    chatInput.blur();
  }

  // ===== 思考浮层 =====
  function openThinkingOverlay() {
    thinkingArea.innerHTML = "";
    thinkingMsgEl = null;
    thinkingStepCount = 0;
    if (thinkingUserEchoEl) thinkingUserEchoEl.textContent = pendingUserText;
    if (thinkingStatusDotEl) {
      thinkingStatusDotEl.style.background = "";
      thinkingStatusDotEl.style.animation = "";
    }
    thinkingOverlay.classList.add("open");
  }

  function closeThinkingOverlay() {
    thinkingOverlay.classList.remove("open");
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

  // ===== 文字输入发送 =====
  function handleSendText() {
    if (isWaitingLLM) return;
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    pendingUserText = text;
    closeInputOverlay();
    openThinkingOverlay();
    sendToLLM();
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
  var LOADING_TEXTS = ["正在分析...", "调用工具中...", "处理数据...", "生成回复..."];

  function createThinkingBubble() {
    thinkingMsgEl = document.createElement("div");
    thinkingMsgEl.className = "thinking-step-item";
    thinkingMsgEl.innerHTML =
      '<div class="step-icon step-icon--loading"></div>' +
      '<div class="step-text">正在分析...</div>';
    thinkingArea.appendChild(thinkingMsgEl);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        thinkingMsgEl && thinkingMsgEl.classList.add("visible");
      });
    });
  }

  function showThinkingStep() {
    if (!thinkingMsgEl) {
      createThinkingBubble();
    }
    var text = LOADING_TEXTS[Math.min(thinkingStepCount, LOADING_TEXTS.length - 1)];
    var stepTextEl = thinkingMsgEl.querySelector(".step-text");
    if (stepTextEl) stepTextEl.textContent = text;
    thinkingStepCount++;
  }

  function showToolResult(event) {
    // 将工具执行结果更新到当前步骤，并准备接受下一个步骤
    if (thinkingMsgEl) {
      var label = SKILL_LABELS[event.name] || event.name;
      var ok = event.result && event.result.success;
      thinkingMsgEl.classList.add(ok ? "done" : "fail");
      var iconEl = thinkingMsgEl.querySelector(".step-icon");
      if (iconEl) {
        iconEl.className = "step-icon";
        iconEl.textContent = ok ? "✓" : "✗";
      }
      var textEl = thinkingMsgEl.querySelector(".step-text");
      if (textEl) textEl.textContent = label + (ok ? " 完成" : " 失败");
      thinkingMsgEl = null;
    }
  }

  // ===== LLM 调用（SSE 流式） =====
  function sendToLLM() {
    isWaitingLLM = true;
    createThinkingBubble();

    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);

    if (!apiKey) {
      closeThinkingOverlay();
      profileBadge.classList.add("show");
      showToast("缺少 API Key，请在个人资料页配置");
      finishLLM();
      return;
    }

    var recent = [{ role: "user", content: pendingUserText }];

    fetch("/api/finance-chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Anon-Token": getOrCreateAnonToken(),
      },
      body: JSON.stringify({
        messages: recent,
        model: model,
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
            showToast("[ERROR] 读取响应流失败: " + err.message);
            finishLLM();
          });
        }

        readChunk();
      })
      .catch(function (err) {
        showToast("[ERROR] " + err.message);
        finishLLM();
      });
  }

  function handleSSEEvent(event) {
    switch (event.type) {
      case "thinking":
        showThinkingStep();
        break;
      case "tool_result":
        showToolResult(event);
        break;
      case "answer":
        // AI 已处理完成，直接关闭思考浮层，数据已由后端持久化到数据库
        finishLLM();
        break;
      case "error":
        showToast("[ERROR] " + (event.message || "未知错误"));
        finishLLM();
        break;
      case "done":
        break;
    }
  }

  function finishLLM() {
    isWaitingLLM = false;
    // 短暂显示成功状态，再关闭浮层
    if (thinkingStatusDotEl) {
      thinkingStatusDotEl.style.background = "var(--color-success)";
      thinkingStatusDotEl.style.animation = "none";
    }
    setTimeout(function () {
      closeThinkingOverlay();
      refreshData();
    }, 700);
  }

  // 启动
  init();
})();
