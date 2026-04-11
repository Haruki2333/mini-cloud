(function () {
  // ===== DOM 引用 =====
  var gameBg = document.getElementById("gameBg");
  var navTitle = document.getElementById("navTitle");
  var navProgress = document.getElementById("navProgress");
  var navBack = document.getElementById("navBack");
  var progressFill = document.getElementById("progressFill");
  var sceneHistory = document.getElementById("sceneHistory");
  var sceneCurrent = document.getElementById("sceneCurrent");
  var sceneNarrative = document.getElementById("sceneNarrative");
  var choicesArea = document.getElementById("choicesArea");
  var actionInputArea = document.getElementById("actionInputArea");
  var actionInput = document.getElementById("actionInput");
  var actionSend = document.getElementById("actionSend");
  var actionSendSpinner = document.getElementById("actionSendSpinner");
  var inspirationChips = document.getElementById("inspirationChips");
  var endingPanel = document.getElementById("endingPanel");
  var endingNarrative = document.getElementById("endingNarrative");
  var gameContent = document.getElementById("gameContent");
  var loadingOverlay = document.getElementById("loadingOverlay");
  var loadingText = document.getElementById("loadingText");
  var loadingSub = document.getElementById("loadingSub");
  var toastEl = document.getElementById("toast");
  var imageBadge = document.getElementById("imageBadge");
  var imageBadgeText = document.getElementById("imageBadgeText");

  var toastTimer = null;
  var imageBadgeHideTimer = null;

  // ===== 游戏状态 =====
  var gameState = {
    id: null,
    title: null,
    worldSetting: null,
    scenes: [],
    messages: [],
    startTime: null,
    isEnding: false,
    progress: 0,
  };

  var isWaiting = false;
  var isReadonly = false;
  // 世界观未确定前，第一轮输出用按钮；确定后切换到自由输入
  var isWorldSelection = true;
  // 每次请求自增，用于与异步下发的 scene_image 事件匹配，避免旧图覆盖新场景
  var turnSeq = 0;
  var currentTurnId = 0;

  // ===== 工具函数 =====

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2500);
  }

  function showInitialLoading(text, sub) {
    loadingText.textContent = text || "AI_PROCESSING";
    loadingSub.textContent = sub || "正在构建故事世界...";
    loadingOverlay.classList.add("visible");
  }

  function hideInitialLoading() {
    loadingOverlay.classList.remove("visible");
  }

  function showImageBadge(text) {
    if (!imageBadge) return;
    clearTimeout(imageBadgeHideTimer);
    imageBadgeText.textContent = text || "场景图生成中…";
    imageBadge.classList.remove("error");
    imageBadge.classList.add("visible");
  }

  function markImageBadgeError(text) {
    if (!imageBadge) return;
    imageBadgeText.textContent = text || "配图失败";
    imageBadge.classList.add("error");
    imageBadge.classList.add("visible");
    clearTimeout(imageBadgeHideTimer);
    imageBadgeHideTimer = setTimeout(function () {
      imageBadge.classList.remove("visible");
      imageBadge.classList.remove("error");
    }, 3000);
  }

  function hideImageBadge() {
    if (!imageBadge) return;
    clearTimeout(imageBadgeHideTimer);
    imageBadge.classList.remove("visible");
    imageBadge.classList.remove("error");
  }

  function scrollToBottom() {
    setTimeout(function () {
      gameContent.scrollTop = gameContent.scrollHeight;
    }, 100);
  }

  function updateProgress(progress) {
    var percent = Math.min(progress * 10, 100);
    progressFill.style.width = percent + "%";
    navProgress.textContent = progress + "/10";
  }

  function setBackgroundImage(url) {
    if (!url) return;
    var img = new Image();
    img.onload = function () {
      gameBg.style.backgroundImage = 'url("' + url + '")';
      gameBg.classList.add("visible");
    };
    img.onerror = function () {
      markImageBadgeError("配图加载失败");
    };
    img.src = url;
  }

  function setInputBusy(busy) {
    if (!actionInput) return;
    actionInput.disabled = busy;
    actionSend.disabled = busy;
    if (busy) {
      actionSend.classList.add("busy");
    } else {
      actionSend.classList.remove("busy");
    }
  }

  function autoResizeInput() {
    if (!actionInput) return;
    actionInput.style.height = "auto";
    actionInput.style.height =
      Math.min(actionInput.scrollHeight, 160) + "px";
  }

  // ===== URL 参数解析 =====

  function getUrlParams() {
    var params = {};
    var search = window.location.search.substring(1);
    if (!search) return params;
    var pairs = search.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split("=");
      params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || "");
    }
    return params;
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

  // ===== 渲染函数 =====

  function renderSceneHistory() {
    var html = "";
    for (var i = 0; i < gameState.scenes.length; i++) {
      var scene = gameState.scenes[i];
      var shortNarrative = scene.narrative || "";
      if (shortNarrative.length > 80) {
        shortNarrative = shortNarrative.substring(0, 80) + "...";
      }
      html +=
        '<div class="scene-history-item">' +
        '<div class="scene-history-text">' +
        escapeHtml(shortNarrative) +
        "</div>";
      if (scene.selectedChoice) {
        html +=
          '<span class="scene-history-choice">' +
          escapeHtml(scene.selectedChoice) +
          "</span>";
      }
      html += "</div>";
    }
    sceneHistory.innerHTML = html;
  }

  function renderNarrativeText(narrative) {
    hideInitialLoading();
    sceneNarrative.innerHTML = "";
    var paragraphs = narrative.split("\n");
    for (var i = 0; i < paragraphs.length; i++) {
      var text = paragraphs[i].trim();
      if (!text) continue;
      var p = document.createElement("p");
      p.textContent = text;
      p.style.marginBottom = "var(--spacing-md)";
      sceneNarrative.appendChild(p);
    }
    sceneCurrent.style.display = "block";
    scrollToBottom();
  }

  function renderCurrentScene(data) {
    // 叙述
    renderNarrativeText(data.narrative || "");

    // 背景图：旧故事恢复场景时可能带 image_url，新流程下通过独立事件下发
    if (data.image_url) {
      setBackgroundImage(data.image_url);
    }

    // 进度
    if (data.progress) {
      gameState.progress = data.progress;
      updateProgress(data.progress);
    }

    // 标题
    if (data.title) {
      gameState.title = data.title;
      navTitle.textContent = data.title;
    }

    // 选项区 vs 输入区
    if (data.is_ending) {
      gameState.isEnding = true;
      choicesArea.innerHTML = "";
      actionInputArea.style.display = "none";
      showEnding(data.narrative);
      return;
    }

    if (isWorldSelection) {
      actionInputArea.style.display = "none";
      renderWorldChoices(data.choices || []);
    } else {
      choicesArea.innerHTML = "";
      actionInputArea.style.display = "block";
      renderInspirationChips(data.choices || []);
      if (!isReadonly) {
        setTimeout(function () {
          actionInput.focus();
        }, 50);
      }
    }

    scrollToBottom();
  }

  function renderWorldChoices(choices) {
    if (!choices || choices.length === 0) {
      choicesArea.innerHTML = "";
      return;
    }

    var html = "";
    for (var i = 0; i < choices.length; i++) {
      var c = choices[i];
      html +=
        '<button class="choice-btn" data-id="' +
        escapeHtml(c.id) +
        '" data-text="' +
        escapeHtml(c.text) +
        '">' +
        '<span class="choice-id">' +
        escapeHtml(c.id) +
        "</span>" +
        '<span class="choice-text">' +
        escapeHtml(c.text) +
        "</span>" +
        "</button>";
    }
    choicesArea.innerHTML = html;

    if (!isReadonly) {
      var btns = choicesArea.querySelectorAll(".choice-btn");
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener("click", handleWorldChoice);
      }
    }
  }

  function renderInspirationChips(choices) {
    if (!inspirationChips) return;
    if (!choices || choices.length === 0) {
      inspirationChips.innerHTML = "";
      return;
    }

    var html = "";
    for (var i = 0; i < choices.length; i++) {
      var c = choices[i];
      html +=
        '<button class="inspiration-chip" type="button" data-text="' +
        escapeHtml(c.text) +
        '">' +
        escapeHtml(c.text) +
        "</button>";
    }
    inspirationChips.innerHTML = html;

    if (!isReadonly) {
      var btns = inspirationChips.querySelectorAll(".inspiration-chip");
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener("click", handleInspirationClick);
      }
    }
  }

  function showEnding(narrative) {
    choicesArea.innerHTML = "";
    actionInputArea.style.display = "none";
    endingNarrative.textContent = narrative;
    endingPanel.style.display = "block";
    sceneCurrent.style.display = "none";

    // 保存完成的故事
    gameState.endTime = new Date().toISOString();
    var storyToSave = {
      id: gameState.id,
      title: gameState.title || "未命名的冒险",
      worldSetting: gameState.worldSetting || "未知世界",
      startTime: gameState.startTime,
      endTime: gameState.endTime,
      scenes: gameState.scenes,
    };
    saveStory(storyToSave);
    clearCurrentStory();

    scrollToBottom();
  }

  // ===== 只读回放模式 =====

  function renderReadonly(story) {
    navTitle.textContent = story.title || "STORY_ARCHIVE";
    isReadonly = true;

    var lastImageUrl = null;
    for (var i = 0; i < story.scenes.length; i++) {
      if (story.scenes[i].imageUrl) {
        lastImageUrl = story.scenes[i].imageUrl;
      }
    }
    if (lastImageUrl) {
      setBackgroundImage(lastImageUrl);
    }

    var html = "";
    for (var j = 0; j < story.scenes.length; j++) {
      var scene = story.scenes[j];
      html += '<div class="scene-history-item">';
      html +=
        '<div class="scene-narrative" style="animation:none; font-size: var(--font-size-base); line-height: 1.7;">';

      var paragraphs = (scene.narrative || "").split("\n");
      for (var p = 0; p < paragraphs.length; p++) {
        var text = paragraphs[p].trim();
        if (text) html += "<p>" + escapeHtml(text) + "</p>";
      }
      html += "</div>";

      if (scene.selectedChoice) {
        html +=
          '<span class="scene-history-choice" style="margin-top: 8px; display: inline-block;">' +
          escapeHtml(scene.selectedChoice) +
          "</span>";
      }

      if (scene.imageUrl) {
        html +=
          '<div style="margin-top: 8px; border-radius: 8px; overflow: hidden; opacity: 0.7;">' +
          '<img src="' +
          escapeHtml(scene.imageUrl) +
          '" style="width: 100%; display: block; border-radius: 8px;" alt="场景图片">' +
          "</div>";
      }

      html += "</div>";
    }
    sceneHistory.innerHTML = html;

    var totalScenes = story.scenes.length;
    updateProgress(Math.min(totalScenes, 10));

    if (story.scenes.length > 0) {
      var lastScene = story.scenes[story.scenes.length - 1];
      if (!lastScene.selectedChoice) {
        endingPanel.style.display = "block";
        endingNarrative.textContent = lastScene.narrative || "";
        sceneCurrent.style.display = "none";
      }
    }

    choicesArea.innerHTML = "";
    actionInputArea.style.display = "none";
  }

  // ===== 用户交互 =====

  function handleWorldChoice() {
    if (isWaiting || isReadonly) return;

    var choiceId = this.dataset.id;
    var choiceText = this.dataset.text;

    // 记录选择到当前场景
    var currentScene = gameState.scenes[gameState.scenes.length - 1];
    if (currentScene) {
      currentScene.selectedChoice = choiceId + ". " + choiceText;
    }

    gameState.worldSetting = choiceText;
    // 世界观一旦选定，立刻切到自由输入模式
    isWorldSelection = false;

    var userMessage = "我选择了: " + choiceId + ". " + choiceText;
    gameState.messages.push({ role: "user", content: userMessage });

    saveCurrentStory(gameState);

    renderSceneHistory();
    sceneNarrative.innerHTML = "";
    choicesArea.innerHTML = "";
    sendToLLM();
  }

  function handleInspirationClick() {
    if (isWaiting || isReadonly || !actionInput) return;
    var text = this.dataset.text || "";
    actionInput.value = text;
    autoResizeInput();
    actionInput.focus();
    // 移动光标到末尾
    actionInput.setSelectionRange(text.length, text.length);
  }

  function handleFreeAction() {
    if (isWaiting || isReadonly) return;
    var raw = (actionInput.value || "").trim();
    if (!raw) {
      actionInput.focus();
      return;
    }

    // 记录到当前场景作为玩家动作摘要
    var currentScene = gameState.scenes[gameState.scenes.length - 1];
    if (currentScene) {
      var shortAction = raw.length > 40 ? raw.substring(0, 40) + "…" : raw;
      currentScene.selectedChoice = "▶ " + shortAction;
    }

    gameState.messages.push({ role: "user", content: raw });

    // 清空输入框 & 灵感
    actionInput.value = "";
    autoResizeInput();
    inspirationChips.innerHTML = "";

    saveCurrentStory(gameState);

    renderSceneHistory();
    sceneNarrative.innerHTML = "";
    sendToLLM();
  }

  if (actionSend) {
    actionSend.addEventListener("click", handleFreeAction);
  }
  if (actionInput) {
    actionInput.addEventListener("input", autoResizeInput);
    actionInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleFreeAction();
      }
    });
  }

  // ===== 与 LLM 通信 =====

  function sendToLLM() {
    if (isWaiting) return;
    isWaiting = true;
    currentTurnId = ++turnSeq;

    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);

    if (!apiKey) {
      showToast("缺少 API Key，请在设置中配置");
      isWaiting = false;
      return;
    }

    setInputBusy(true);

    var characterProfile = getCharacterProfile();
    var context = {
      worldSetting: gameState.worldSetting || null,
      choiceCount: gameState.scenes.length,
      characterProfile: characterProfile || null,
    };

    fetch(API_BASE + "/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        messages: gameState.messages,
        model: model,
        context: context,
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
        var currentSceneData = null;
        var narrativeShown = false;
        var turnImagePending = false;
        // 本轮收到的图片 URL：由于 scene_image 可能早于 [DONE]（finishTurn 时机）到达，
        // 先缓存到局部变量，在 finishTurn 中随新场景一起归档，避免错写到上一场景。
        var turnImageUrl = null;

        function readChunk() {
          reader
            .read()
            .then(function (result) {
              if (result.done) {
                finishTurn(currentSceneData, turnImageUrl);
                return;
              }

              buffer += decoder.decode(result.value, { stream: true });
              var parts = buffer.split("\n\n");
              buffer = parts.pop() || "";

              for (var i = 0; i < parts.length; i++) {
                var events = parseSSEChunk(parts[i]);
                for (var j = 0; j < events.length; j++) {
                  var event = events[j];

                  if (event.type === "thinking") {
                    // 尝试从 tool_calls 参数中提前获取叙述文字
                    if (
                      !narrativeShown &&
                      event.tool_calls &&
                      event.tool_calls.length > 0
                    ) {
                      for (var k = 0; k < event.tool_calls.length; k++) {
                        if (event.tool_calls[k].name === "advance_story") {
                          try {
                            var args = JSON.parse(
                              event.tool_calls[k].arguments
                            );
                            if (args.narrative) {
                              renderNarrativeText(args.narrative);
                              narrativeShown = true;
                            }
                          } catch (e) {}
                        }
                      }
                    }
                  }

                  if (event.type === "tool_result") {
                    if (event.name === "advance_story" && event.result) {
                      currentSceneData = event.result;
                    }
                  }

                  if (event.type === "scene_image_pending") {
                    if (event.turn_id === currentTurnId) {
                      turnImagePending = true;
                      showImageBadge("场景图生成中…");
                    }
                  }

                  if (event.type === "scene_image") {
                    if (event.turn_id === currentTurnId && event.url) {
                      setBackgroundImage(event.url);
                      hideImageBadge();
                      // 缓存到本轮局部变量：finishTurn 时作为新场景的 imageUrl 归档。
                      // 若 finishTurn 已经执行过（极端情况下 [DONE] 早于 scene_image），
                      // 则兜底写到最后一个 scene 记录上。
                      turnImageUrl = event.url;
                      if (!isWaiting) {
                        var last =
                          gameState.scenes[gameState.scenes.length - 1];
                        if (last) {
                          last.imageUrl = event.url;
                          saveCurrentStory(gameState);
                        }
                      }
                    }
                  }

                  if (event.type === "scene_image_error") {
                    if (event.turn_id === currentTurnId) {
                      markImageBadgeError("配图失败");
                    }
                  }

                  if (event.type === "answer") {
                    if (!currentSceneData) {
                      try {
                        currentSceneData = JSON.parse(event.content);
                      } catch (e) {
                        currentSceneData = {
                          narrative: event.content,
                          choices: [],
                          is_ending: false,
                          progress: gameState.progress + 1,
                        };
                      }
                    }
                  }

                  if (event.type === "error") {
                    showToast(event.message || "发生错误");
                    isWaiting = false;
                    setInputBusy(false);
                    if (turnImagePending) hideImageBadge();
                    return;
                  }
                }
              }

              readChunk();
            })
            .catch(function (err) {
              showToast("读取响应失败: " + err.message);
              isWaiting = false;
              setInputBusy(false);
              hideInitialLoading();
            });
        }

        readChunk();
      })
      .catch(function (err) {
        showToast(err.message);
        isWaiting = false;
        setInputBusy(false);
        hideInitialLoading();
      });
  }

  function finishTurn(sceneData, turnImageUrl) {
    isWaiting = false;
    setInputBusy(false);
    hideInitialLoading();

    if (!sceneData) {
      showToast("未获取到故事数据");
      return;
    }

    // 已经在 thinking 阶段提前渲染了 narrative；这里只做进度/选项/输入区等补充
    renderCurrentScene(sceneData);

    // 记录场景到 gameState。turnImageUrl 若在 [DONE] 前到达，会一并归档。
    var sceneRecord = {
      narrative: sceneData.narrative,
      choices: sceneData.choices || [],
      imageUrl: turnImageUrl || null,
      selectedChoice: null,
    };
    gameState.scenes.push(sceneRecord);

    // 记录 assistant 消息（仅叙述文本）
    gameState.messages.push({
      role: "assistant",
      content: sceneData.narrative,
    });

    if (sceneData.title && !gameState.title) {
      gameState.title = sceneData.title;
    }

    saveCurrentStory(gameState);

    if (sceneData.is_ending) {
      showEnding(sceneData.narrative);
    }
  }

  // ===== 离开确认 =====

  navBack.addEventListener("click", function (e) {
    if (!isReadonly && gameState.scenes.length > 0 && !gameState.isEnding) {
      var confirmed = confirm("游戏进度已自动保存，确定要离开吗？");
      if (!confirmed) {
        e.preventDefault();
      }
    }
  });

  // ===== 初始化 =====

  function init() {
    var params = getUrlParams();

    // 只读模式：查看历史故事
    if (params.readonly === "1" && params.story) {
      var story = getStoryById(params.story);
      if (!story) {
        showToast("故事不存在");
        window.location.href = "index.html";
        return;
      }
      renderReadonly(story);
      return;
    }

    // 继续模式：恢复未完成故事
    if (params.continue === "1") {
      var current = getCurrentStory();
      if (current) {
        gameState = current;
        isWorldSelection = !gameState.worldSetting;
        if (gameState.title) navTitle.textContent = gameState.title;
        updateProgress(gameState.progress);
        renderSceneHistory();
        var lastScene = gameState.scenes[gameState.scenes.length - 1];
        if (lastScene && !lastScene.selectedChoice) {
          renderCurrentScene({
            narrative: lastScene.narrative,
            choices: lastScene.choices || [],
            image_url: lastScene.imageUrl,
            progress: gameState.progress,
            is_ending: false,
          });
        }
        for (var i = gameState.scenes.length - 1; i >= 0; i--) {
          if (gameState.scenes[i].imageUrl) {
            setBackgroundImage(gameState.scenes[i].imageUrl);
            break;
          }
        }
        return;
      }
    }

    // 新游戏：首次加载显示一次全屏 loading，后续由 inline spinner 接管
    gameState.id = generateId();
    gameState.startTime = new Date().toISOString();
    gameState.messages = [
      {
        role: "user",
        content:
          "开始一个新的冒险故事，请提供几个不同风格的冒险世界观选项让我选择。",
      },
    ];
    saveCurrentStory(gameState);
    showInitialLoading("AI_PROCESSING", "正在构建故事世界...");
    sendToLLM();
  }

  init();
})();
