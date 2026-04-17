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
  var goalBanner = document.getElementById("goalBanner");
  var goalBannerText = document.getElementById("goalBannerText");

  var toastTimer = null;
  var imageBadgeHideTimer = null;

  // ===== 游戏状态 =====
  var gameState = {
    id: null,       // 客户端生成的临时 ID（仅前端使用）
    storyId: null,  // 服务端 story_id（持久化存档标识）
    title: null,
    worldSetting: null,
    // 本局目标：玩家在世界观选择时确定，贯穿整个故事
    goal: null,
    scenes: [],
    messages: [],
    startTime: null,
    isEnding: false,
    progress: 0,
    chapter: 1,
    beat: 1,
  };

  var isWaiting = false;
  var isReadonly = false;
  // 背景未确认前展示背景介绍 + 确认/重新生成按钮；确认后切换到自由输入
  var isWorldSelection = true;
  // 每次请求自增，用于与异步下发的 scene_image 事件匹配，避免旧图覆盖新场景
  var turnSeq = 0;
  var currentTurnId = 0;
  // 缓存第一轮返回的背景数据（用于确认时获取 goal 等字段）
  var pendingBackgroundData = null;

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

  function updateProgress(progress, chapter, beat) {
    // 总进度：(chapter-1)*10 + beat，共 50 拍（5章×10节）
    var ch = chapter || Math.ceil(progress / 2) || 1;
    var bt = beat || progress || 1;
    var total = Math.min((ch - 1) * 10 + bt, 50);
    var percent = Math.min(total * 2, 100); // 50拍 = 100%
    progressFill.style.width = percent + "%";
    navProgress.textContent = "第" + ch + "章·" + bt + "/10";
  }

  function showGoalBanner(goal) {
    if (!goalBanner || !goalBannerText) return;
    if (!goal) {
      goalBanner.style.display = "none";
      return;
    }
    goalBannerText.textContent = goal;
    goalBanner.style.display = "flex";
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

  /**
   * 渲染当前场景的元数据（进度、标题、选项区等）。
   *
   * @param {object} data - 场景数据
   * @param {boolean} skipNarrative - 若为 true，跳过叙述文本渲染（已由流式提前完成）
   */
  function renderCurrentScene(data, skipNarrative) {
    if (!skipNarrative) {
      // 非流式路径：完整渲染叙述
      renderNarrativeText(data.narrative || "");
    } else {
      // 流式路径：叙述已逐字渲染完毕，仅确保容器可见
      hideInitialLoading();
      sceneCurrent.style.display = "block";
    }

    // 背景图：旧故事恢复场景时可能带 image_url，新流程下通过独立事件下发
    if (data.image_url) {
      setBackgroundImage(data.image_url);
    }

    // 进度（chapter/beat 优先，progress 作为兜底）
    if (data.chapter) gameState.chapter = data.chapter;
    if (data.beat) gameState.beat = data.beat;
    if (data.progress) gameState.progress = data.progress;
    if (data.chapter || data.beat || data.progress) {
      updateProgress(data.progress, data.chapter, data.beat);
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
      renderBackgroundConfirmButtons(data);
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

  function renderBackgroundConfirmButtons(sceneData) {
    pendingBackgroundData = sceneData;

    var goalHtml = "";
    if (sceneData && sceneData.goal) {
      goalHtml =
        '<div class="bg-goal-hint">' +
        '<span class="bg-goal-label">使命</span>' +
        escapeHtml(sceneData.goal) +
        "</div>";
    }

    choicesArea.innerHTML =
      goalHtml +
      '<div class="bg-confirm-actions">' +
      '<button class="choice-btn choice-btn--confirm" id="confirmBackgroundBtn">确认，踏入江湖</button>' +
      '<button class="choice-btn choice-btn--regen" id="regenBackgroundBtn">再次随机生成</button>' +
      "</div>";

    if (!isReadonly) {
      document
        .getElementById("confirmBackgroundBtn")
        .addEventListener("click", handleConfirmBackground);
      document
        .getElementById("regenBackgroundBtn")
        .addEventListener("click", handleRegenerateBackground);
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
      goal: gameState.goal || null,
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

    // 恢复历史故事的目标条（旧数据可能无 goal 字段，跳过即可）
    if (story.goal) showGoalBanner(story.goal);

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

  function handleConfirmBackground() {
    if (isWaiting || isReadonly || !pendingBackgroundData) return;

    var narrative = pendingBackgroundData.narrative || "";
    gameState.worldSetting = narrative.length > 200 ? narrative.substring(0, 200) : narrative;
    gameState.goal = pendingBackgroundData.goal || null;
    isWorldSelection = false;

    showGoalBanner(gameState.goal);

    // 将背景场景标记为已选定
    var currentScene = gameState.scenes[gameState.scenes.length - 1];
    if (currentScene) {
      currentScene.selectedChoice = "▶ 踏入江湖";
    }

    gameState.messages.push({ role: "user", content: "好的，我对这个故事背景感兴趣，开始冒险！" });

    pendingBackgroundData = null;
    choicesArea.innerHTML = "";

    saveCurrentStory(gameState);

    renderSceneHistory();
    sceneNarrative.innerHTML = "";
    sendToLLM();
  }

  function handleRegenerateBackground() {
    if (isWaiting || isReadonly) return;

    // 放弃当前 story_id，重新生成
    gameState.storyId = null;
    gameState.scenes = [];
    gameState.messages = [
      {
        role: "user",
        content: "开始一个新的中国传统武侠冒险故事，请直接生成故事背景描述。",
      },
    ];
    pendingBackgroundData = null;

    sceneNarrative.innerHTML = "";
    sceneHistory.innerHTML = "";
    choicesArea.innerHTML = "";

    saveCurrentStory(gameState);
    showInitialLoading("AI_PROCESSING", "重新构建故事世界...");
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
      goal: gameState.goal || null,
      choiceCount: gameState.scenes.length,
      chapter: gameState.chapter || 1,
      beat: gameState.beat || 1,
      characterProfile: characterProfile || null,
    };

    // 只发最近 12 条消息（6 轮），减少 token 消耗
    var recentMessages = gameState.messages;
    if (recentMessages.length > 12) {
      recentMessages = recentMessages.slice(-12);
    }

    fetch(API_BASE + "/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Anon-Token": getAnonToken(),
      },
      body: JSON.stringify({
        story_id: gameState.storyId || null,
        messages: recentMessages,
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
        // 流式叙述：当前正在追加文字的段落元素
        var streamingParagraph = null;

        function readChunk() {
          reader
            .read()
            .then(function (result) {
              if (result.done) {
                finishTurn(currentSceneData, turnImageUrl, narrativeShown);
                return;
              }

              buffer += decoder.decode(result.value, { stream: true });
              var parts = buffer.split("\n\n");
              buffer = parts.pop() || "";

              for (var i = 0; i < parts.length; i++) {
                var events = parseSSEChunk(parts[i]);
                for (var j = 0; j < events.length; j++) {
                  var event = events[j];

                  // 流式叙述：逐片追加到 DOM，无需等待全量响应
                  if (event.type === "narrative_delta") {
                    if (!narrativeShown) {
                      // 第一个 delta 到达：准备叙述容器
                      hideInitialLoading();
                      sceneNarrative.innerHTML = "";
                      sceneCurrent.style.display = "block";
                      narrativeShown = true;
                      streamingParagraph = document.createElement("p");
                      streamingParagraph.style.marginBottom = "var(--spacing-md)";
                      sceneNarrative.appendChild(streamingParagraph);
                    }
                    // 追加字符，按 \n 换段
                    var deltaChars = event.content;
                    for (var d = 0; d < deltaChars.length; d++) {
                      if (deltaChars[d] === "\n") {
                        if (streamingParagraph && streamingParagraph.textContent.trim()) {
                          streamingParagraph = document.createElement("p");
                          streamingParagraph.style.marginBottom = "var(--spacing-md)";
                          sceneNarrative.appendChild(streamingParagraph);
                        }
                      } else if (streamingParagraph) {
                        streamingParagraph.textContent += deltaChars[d];
                      }
                    }
                    scrollToBottom();
                  }

                  if (event.type === "thinking") {
                    // 流式路径下 narrative 已渲染，此处仅作非流式兜底
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

                  // 服务端创建新存档，记录 story_id
                  if (event.type === "story_created") {
                    gameState.storyId = event.story_id;
                    saveCurrentStory(gameState);
                  }

                  // 存档保存成功（服务端确认）
                  if (event.type === "story_saved") {
                    if (event.story_id && !gameState.storyId) {
                      gameState.storyId = event.story_id;
                    }
                  }

                  // 章节压缩完成（可选：显示提示）
                  // if (event.type === "chapter_compacted") { ... }

                  if (event.type === "tool_result") {
                    if (event.name === "advance_story" && event.result) {
                      currentSceneData = event.result;
                    }
                  }

                  if (event.type === "scene_image_pending") {
                    turnImagePending = true;
                    showImageBadge("场景图生成中…");
                  }

                  if (event.type === "scene_image") {
                    if (event.url) {
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
                    markImageBadgeError("配图失败");
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

  function finishTurn(sceneData, turnImageUrl, narrativeAlreadyStreamed) {
    isWaiting = false;
    setInputBusy(false);
    hideInitialLoading();

    if (!sceneData) {
      showToast("未获取到故事数据");
      return;
    }

    // 若叙述已通过 narrative_delta 流式渲染，跳过 narrative 重渲染（防止闪烁）
    renderCurrentScene(sceneData, narrativeAlreadyStreamed);

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

    // 更新章节/节拍（在 renderCurrentScene 之前，确保进度条正确）
    if (sceneData.chapter) gameState.chapter = sceneData.chapter;
    if (sceneData.beat) gameState.beat = sceneData.beat;

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

    // 只读模式：查看历史故事（本地存档）
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

    // 服务端存档恢复模式
    if (params.resume === "1" && params.story_id) {
      resumeFromServer(params.story_id);
      return;
    }

    // 继续模式：恢复未完成故事（本地缓存）
    if (params.continue === "1") {
      var current = getCurrentStory();
      if (current) {
        gameState = current;
        isWorldSelection = !gameState.worldSetting;
        if (gameState.title) navTitle.textContent = gameState.title;
        updateProgress(gameState.progress, gameState.chapter, gameState.beat);
        // 恢复目标条
        if (gameState.goal) showGoalBanner(gameState.goal);
        renderSceneHistory();
        var lastScene = gameState.scenes[gameState.scenes.length - 1];
        if (lastScene && !lastScene.selectedChoice) {
          renderCurrentScene({
            narrative: lastScene.narrative,
            choices: lastScene.choices || [],
            image_url: lastScene.imageUrl,
            progress: gameState.progress,
            chapter: gameState.chapter,
            beat: gameState.beat,
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
    gameState.storyId = null; // 服务端会在首次响应中创建并返回 story_id
    gameState.startTime = new Date().toISOString();
    gameState.chapter = 1;
    gameState.beat = 1;
    gameState.messages = [
      {
        role: "user",
        content:
          "开始一个新的中国传统武侠冒险故事，请直接生成故事背景描述。",
      },
    ];
    saveCurrentStory(gameState);
    showInitialLoading("AI_PROCESSING", "正在构建故事世界...");
    sendToLLM();
  }

  /**
   * 从服务端存档恢复游戏
   * @param {string} serverStoryId
   */
  function resumeFromServer(serverStoryId) {
    showInitialLoading("AI_PROCESSING", "正在加载存档...");

    fetch(API_BASE + "/stories/" + encodeURIComponent(serverStoryId), {
      headers: { "X-Anon-Token": getAnonToken() },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("存档加载失败 (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        hideInitialLoading();
        var story = data.story;
        var recentScenes = data.recentScenes || [];

        if (!story) {
          showToast("存档数据异常");
          window.location.href = "index.html";
          return;
        }

        // 恢复 gameState
        gameState.id = story.story_id;
        gameState.storyId = story.story_id;
        gameState.title = story.title || null;
        gameState.worldSetting = story.world_setting || null;
        gameState.goal = story.goal || null;
        gameState.chapter = story.current_chapter || 1;
        gameState.beat = story.current_beat || 1;
        gameState.progress = story.current_beat || 1;
        gameState.startTime = story.created_at || new Date().toISOString();
        gameState.isEnding = story.status === "ended";
        gameState.scenes = [];
        gameState.messages = [];

        isWorldSelection = !gameState.worldSetting;

        // 从场景列表重建 messages 和 scenes
        for (var i = 0; i < recentScenes.length; i++) {
          var sc = recentScenes[i];
          if (sc.player_action) {
            gameState.messages.push({ role: "user", content: sc.player_action });
          }
          gameState.messages.push({ role: "assistant", content: sc.narrative });
          gameState.scenes.push({
            narrative: sc.narrative,
            choices: sc.choices || [],
            imageUrl: sc.image_url || null,
            selectedChoice: null,
          });
        }

        if (gameState.title) navTitle.textContent = gameState.title;
        if (gameState.goal) showGoalBanner(gameState.goal);
        updateProgress(gameState.progress, gameState.chapter, gameState.beat);
        renderSceneHistory();

        // 恢复最后一个场景
        var lastScene = gameState.scenes[gameState.scenes.length - 1];
        if (lastScene) {
          if (gameState.isEnding) {
            showEnding(lastScene.narrative);
          } else {
            renderCurrentScene({
              narrative: lastScene.narrative,
              choices: lastScene.choices || [],
              image_url: lastScene.imageUrl,
              progress: gameState.progress,
              chapter: gameState.chapter,
              beat: gameState.beat,
              is_ending: false,
            });
          }
          for (var j = gameState.scenes.length - 1; j >= 0; j--) {
            if (gameState.scenes[j].imageUrl) {
              setBackgroundImage(gameState.scenes[j].imageUrl);
              break;
            }
          }
        }

        saveCurrentStory(gameState);
      })
      .catch(function (err) {
        hideInitialLoading();
        showToast("存档加载失败: " + err.message);
        setTimeout(function () {
          window.location.href = "index.html";
        }, 2000);
      });
  }

  init();
})();
