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
  var endingPanel = document.getElementById("endingPanel");
  var endingNarrative = document.getElementById("endingNarrative");
  var gameContent = document.getElementById("gameContent");
  var loadingOverlay = document.getElementById("loadingOverlay");
  var loadingText = document.getElementById("loadingText");
  var loadingSub = document.getElementById("loadingSub");
  var toastEl = document.getElementById("toast");

  var toastTimer = null;

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

  // ===== 工具函数 =====

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2500);
  }

  function showLoading(text, sub) {
    loadingText.textContent = text || "AI_PROCESSING";
    loadingSub.textContent = sub || "正在构建故事世界...";
    loadingOverlay.classList.add("visible");
  }

  function hideLoading() {
    loadingOverlay.classList.remove("visible");
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
    img.src = url;
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
      // 截断叙述文字
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

  function renderCurrentScene(data) {
    // 更新叙述
    sceneNarrative.innerHTML = "";
    var paragraphs = data.narrative.split("\n");
    for (var i = 0; i < paragraphs.length; i++) {
      var text = paragraphs[i].trim();
      if (!text) continue;
      var p = document.createElement("p");
      p.textContent = text;
      p.style.marginBottom = "var(--spacing-md)";
      sceneNarrative.appendChild(p);
    }
    sceneCurrent.style.display = "block";

    // 更新背景图
    if (data.image_url) {
      setBackgroundImage(data.image_url);
    }

    // 更新进度
    if (data.progress) {
      gameState.progress = data.progress;
      updateProgress(data.progress);
    }

    // 更新标题
    if (data.title) {
      gameState.title = data.title;
      navTitle.textContent = data.title;
    }

    // 渲染选项
    renderChoices(data.choices, data.is_ending);

    // 处理结局
    if (data.is_ending) {
      gameState.isEnding = true;
      showEnding(data.narrative);
    }

    scrollToBottom();
  }

  function renderChoices(choices, isEnding) {
    if (isEnding || !choices || choices.length === 0) {
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

    // 绑定选项点击
    if (!isReadonly) {
      var btns = choicesArea.querySelectorAll(".choice-btn");
      for (var j = 0; j < btns.length; j++) {
        btns[j].addEventListener("click", handleChoiceClick);
      }
    }
  }

  function showEnding(narrative) {
    choicesArea.innerHTML = "";
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

    // 找出最后一个有图片的场景
    var lastImageUrl = null;
    for (var i = 0; i < story.scenes.length; i++) {
      if (story.scenes[i].imageUrl) {
        lastImageUrl = story.scenes[i].imageUrl;
      }
    }
    if (lastImageUrl) {
      setBackgroundImage(lastImageUrl);
    }

    // 渲染所有场景
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

      // 显示用户的选择
      if (scene.selectedChoice) {
        html +=
          '<span class="scene-history-choice" style="margin-top: 8px; display: inline-block;">' +
          escapeHtml(scene.selectedChoice) +
          "</span>";
      }

      // 显示场景图片（缩略）
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

    // 更新进度条
    var totalScenes = story.scenes.length;
    updateProgress(Math.min(totalScenes, 10));

    // 显示结局
    if (story.scenes.length > 0) {
      var lastScene = story.scenes[story.scenes.length - 1];
      if (!lastScene.selectedChoice) {
        // 最后一个场景没有选择，就是结局
        endingPanel.style.display = "block";
        endingNarrative.textContent = lastScene.narrative || "";
        sceneCurrent.style.display = "none";
      }
    }

    choicesArea.innerHTML = "";
  }

  // ===== 用户选择处理 =====

  function handleChoiceClick() {
    if (isWaiting || isReadonly) return;

    var choiceId = this.dataset.id;
    var choiceText = this.dataset.text;

    // 记录选择到当前场景
    var currentScene = gameState.scenes[gameState.scenes.length - 1];
    if (currentScene) {
      currentScene.selectedChoice = choiceId + ". " + choiceText;
    }

    // 如果是世界观选择（第一轮）
    if (gameState.progress <= 1 && !gameState.worldSetting) {
      gameState.worldSetting = choiceText;
    }

    // 构建用户消息
    var userMessage = "我选择了: " + choiceId + ". " + choiceText;
    gameState.messages.push({ role: "user", content: userMessage });

    // 保存当前状态
    saveCurrentStory(gameState);

    // 渲染历史并发送请求
    renderSceneHistory();
    sceneNarrative.innerHTML = "";
    choicesArea.innerHTML = "";
    sendToLLM();
  }

  // ===== 与 LLM 通信 =====

  function sendToLLM() {
    if (isWaiting) return;
    isWaiting = true;

    var settings = getSettings();
    var model = settings.model || DEFAULT_MODEL;
    var apiKey = getApiKeyForModel(model);

    if (!apiKey) {
      showToast("缺少 API Key，请在设置中配置");
      isWaiting = false;
      return;
    }

    var loadingMessages = [
      "正在编织故事线索...",
      "构建冒险场景中...",
      "探索未知领域...",
      "命运的齿轮开始转动...",
    ];
    var randomMsg =
      loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
    showLoading("AI_PROCESSING", randomMsg);

    var context = {
      worldSetting: gameState.worldSetting || null,
      choiceCount: gameState.scenes.length,
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

        function readChunk() {
          reader
            .read()
            .then(function (result) {
              if (result.done) {
                finishTurn(currentSceneData);
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
                              // 提前显示叙述文字
                              renderNarrativeText(args.narrative);
                              narrativeShown = true;
                              // 如果有图片生成，显示提示
                              if (args.image_prompt) {
                                loadingSub.textContent = "正在生成场景图片...";
                              }
                            }
                          } catch (e) {}
                        }
                      }
                    }
                  }

                  if (event.type === "tool_result") {
                    if (event.name === "advance_story" && event.result) {
                      currentSceneData = event.result;
                      hideLoading();
                    }
                  }

                  if (event.type === "answer") {
                    // 最终回答，如果还没有 scene data 则用 answer 内容
                    if (!currentSceneData) {
                      // 尝试解析 JSON
                      try {
                        currentSceneData = JSON.parse(event.content);
                      } catch (e) {
                        // 纯文本兜底
                        currentSceneData = {
                          narrative: event.content,
                          choices: [],
                          is_ending: false,
                          progress: gameState.progress + 1,
                        };
                      }
                    }
                    hideLoading();
                  }

                  if (event.type === "error") {
                    hideLoading();
                    showToast(event.message || "发生错误");
                    isWaiting = false;
                    return;
                  }
                }
              }

              readChunk();
            })
            .catch(function (err) {
              hideLoading();
              showToast("读取响应失败: " + err.message);
              isWaiting = false;
            });
        }

        readChunk();
      })
      .catch(function (err) {
        hideLoading();
        showToast(err.message);
        isWaiting = false;
      });
  }

  function renderNarrativeText(narrative) {
    hideLoading();
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

  function finishTurn(sceneData) {
    isWaiting = false;
    hideLoading();

    if (!sceneData) {
      showToast("未获取到故事数据");
      return;
    }

    // 渲染完整场景（可能之前已经渲染了叙述，这里补充选项和图片）
    renderCurrentScene(sceneData);

    // 记录场景到 gameState
    var sceneRecord = {
      narrative: sceneData.narrative,
      choices: sceneData.choices || [],
      imageUrl: sceneData.image_url || null,
      selectedChoice: null,
    };
    gameState.scenes.push(sceneRecord);

    // 记录 assistant 消息（仅叙述文本）
    gameState.messages.push({
      role: "assistant",
      content: sceneData.narrative,
    });

    // 更新标题
    if (sceneData.title && !gameState.title) {
      gameState.title = sceneData.title;
    }

    // 保存当前状态
    saveCurrentStory(gameState);

    // 如果是结局，保存完成的故事
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
        // 恢复 UI
        if (gameState.title) navTitle.textContent = gameState.title;
        updateProgress(gameState.progress);
        renderSceneHistory();
        // 渲染最后一个场景的选项
        var lastScene = gameState.scenes[gameState.scenes.length - 1];
        if (lastScene && lastScene.choices && !lastScene.selectedChoice) {
          renderCurrentScene({
            narrative: lastScene.narrative,
            choices: lastScene.choices,
            image_url: lastScene.imageUrl,
            progress: gameState.progress,
            is_ending: false,
          });
        }
        // 恢复背景图
        for (var i = gameState.scenes.length - 1; i >= 0; i--) {
          if (gameState.scenes[i].imageUrl) {
            setBackgroundImage(gameState.scenes[i].imageUrl);
            break;
          }
        }
        return;
      }
    }

    // 新游戏
    gameState.id = generateId();
    gameState.startTime = new Date().toISOString();
    gameState.messages = [
      {
        role: "user",
        content: "开始一个新的冒险故事，请提供几个不同风格的冒险世界观选项让我选择。",
      },
    ];
    saveCurrentStory(gameState);
    sendToLLM();
  }

  init();
})();
