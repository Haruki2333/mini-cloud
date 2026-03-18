(function () {
  // 通讯消息序列（每组包含系统消息 + AI 消息）
  var messageSequences = [
    [
      { type: "system", text: "[SIGNAL ACQUIRED] 光明频道已建立" },
      { type: "ai", text: "你好，来自此刻的朋友。将你眼前的食物展示给我，我会为你解读它的故事。" },
    ],
    [
      { type: "system", text: "[HANDSHAKE OK] 通讯链路稳定" },
      { type: "ai", text: "食物承载着文明的记忆。拍一张照片，让我帮你记录这一刻的味道。" },
    ],
    [
      { type: "system", text: "[SYNC COMPLETE] 数据通道就绪" },
      { type: "ai", text: "每一道菜背后都有值得被记住的智慧。准备好了吗？把你的美食给我看看。" },
    ],
    [
      { type: "system", text: "[BEACON ACTIVE] 信号灯塔运行中" },
      { type: "ai", text: "在未来，人们依然热爱美食。让我用光明的视角，为你解析这份料理。" },
    ],
    [
      { type: "system", text: "[LINK VERIFIED] 终端认证通过" },
      { type: "ai", text: "欢迎回到光明通讯终端。拍下你的食物，我会告诉你关于它的一切。" },
    ],
  ];

  // 随机频率
  var frequencies = ["47.3 kHz", "52.1 kHz", "38.7 kHz", "61.4 kHz", "44.9 kHz"];
  var channels = ["CH-07", "CH-12", "CH-03", "CH-19", "CH-25"];

  var terminalMessages = document.getElementById("terminalMessages");
  var signalFreq = document.getElementById("signalFreq");
  var terminalFreq = document.getElementById("terminalFreq");
  var cameraBtn = document.getElementById("cameraBtn");
  var albumBtn = document.getElementById("albumBtn");
  var cameraInput = document.getElementById("cameraInput");
  var albumInput = document.getElementById("albumInput");
  var loadingOverlay = document.getElementById("loadingOverlay");
  var loadingProgressBar = document.getElementById("loadingProgressBar");
  var loadingText = document.getElementById("loadingText");
  var loadingTextMain = document.getElementById("loadingTextMain");

  // 设置随机频率
  var freqIdx = Math.floor(Math.random() * frequencies.length);
  signalFreq.textContent = frequencies[freqIdx];
  terminalFreq.textContent = channels[freqIdx];

  // 选取随机消息序列并逐条渲染
  var sequence = messageSequences[Math.floor(Math.random() * messageSequences.length)];
  renderMessages(sequence);

  function renderMessages(msgs) {
    var delay = 300;
    msgs.forEach(function (msg, i) {
      setTimeout(function () {
        var el = document.createElement("div");
        el.className = "terminal-msg terminal-msg--" + msg.type;

        if (msg.type === "system") {
          el.innerHTML = '<span class="msg-prefix">&gt; </span>' + escapeHtml(msg.text);
        } else {
          // AI 消息逐字打出
          var cursor = document.createElement("span");
          cursor.className = "typing-cursor";
          el.appendChild(cursor);
          typeText(el, msg.text, cursor);
        }

        terminalMessages.appendChild(el);
        terminalMessages.scrollTop = terminalMessages.scrollHeight;
      }, delay);
      delay += msg.type === "system" ? 600 : 800;
    });
  }

  function typeText(container, text, cursor) {
    var idx = 0;
    var timer = setInterval(function () {
      if (idx < text.length) {
        container.insertBefore(document.createTextNode(text[idx]), cursor);
        idx++;
        terminalMessages.scrollTop = terminalMessages.scrollHeight;
      } else {
        clearInterval(timer);
        if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
      }
    }, 50);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // 拍照
  cameraBtn.addEventListener("click", function () {
    cameraInput.click();
  });

  // 从相册选择
  albumBtn.addEventListener("click", function () {
    albumInput.click();
  });

  // 当前照片的元数据（EXIF 时间 + 位置）
  var currentPhotoMeta = null;

  // 统一处理图片选择
  function handleFileSelect(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    // 先提取 EXIF，再压缩识别
    getPhotoMeta(file, function (meta) {
      currentPhotoMeta = meta;
    });
    compressAndRecognize(file);
    // 清空 input 以便重复选择同一文件
    e.target.value = "";
  }

  cameraInput.addEventListener("change", handleFileSelect);
  albumInput.addEventListener("change", handleFileSelect);

  // 图片压缩 + AI 识别
  function compressAndRecognize(file) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        // 发给 API 的高质量图（800px，0.8 质量）
        var canvas = document.createElement("canvas");
        var maxSize = 800;
        var width = img.width;
        var height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        var apiBase64 = canvas.toDataURL("image/jpeg", 0.8);

        // 存入 localStorage 的缩略图（300px，0.5 质量，大幅减少占用）
        var thumbCanvas = document.createElement("canvas");
        var maxThumb = 300;
        var tw = img.width;
        var th = img.height;
        if (tw > maxThumb || th > maxThumb) {
          if (tw > th) { th = (th / tw) * maxThumb; tw = maxThumb; }
          else { tw = (tw / th) * maxThumb; th = maxThumb; }
        }
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        thumbCanvas.getContext("2d").drawImage(img, 0, 0, tw, th);
        var thumbBase64 = thumbCanvas.toDataURL("image/jpeg", 0.5);

        recognizeFood(apiBase64, thumbBase64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 加载动画控制
  var loadingTimer = null;
  var progressTimer = null;

  var loadingTexts = [
    { en: "SCANNING IMAGE...", zh: "正在扫描图像数据" },
    { en: "ANALYZING PATTERN...", zh: "正在分析食物特征" },
    { en: "CROSS-REFERENCING...", zh: "正在交叉比对数据库" },
    { en: "DECODING RESULT...", zh: "正在解码识别结果" },
    { en: "FINALIZING...", zh: "即将完成解析" },
  ];

  function startLoadingAnimation() {
    loadingOverlay.classList.add("visible");
    loadingProgressBar.style.width = "0%";

    var textIdx = 0;
    loadingText.textContent = loadingTexts[0].en;
    loadingTextMain.textContent = loadingTexts[0].zh;

    // 模拟进度
    var progress = 0;
    progressTimer = setInterval(function () {
      progress += Math.random() * 8 + 2;
      if (progress > 90) progress = 90;
      loadingProgressBar.style.width = progress + "%";
    }, 400);

    // 文字轮换
    loadingTimer = setInterval(function () {
      textIdx = (textIdx + 1) % loadingTexts.length;
      loadingText.textContent = loadingTexts[textIdx].en;
      loadingTextMain.textContent = loadingTexts[textIdx].zh;
    }, 2000);
  }

  function stopLoadingAnimation() {
    clearInterval(progressTimer);
    clearInterval(loadingTimer);
    loadingProgressBar.style.width = "100%";
    setTimeout(function () {
      loadingOverlay.classList.remove("visible");
    }, 300);
  }

  // 调用 AI 识别 API
  function recognizeFood(base64, thumbBase64) {
    var settings = getSettings();
    var currentModel = settings.model || DEFAULT_MODEL;
    var config = MODEL_CONFIG[currentModel];

    if (!config) {
      showError("不支持的模型，请在设置中切换");
      return;
    }

    var apiKey = settings.apiKeys[config.provider];

    if (!apiKey) {
      showError("请先在设置页面配置 " + config.label + " 的 API Key");
      return;
    }

    // 显示 loading
    startLoadingAnimation();

    fetch("/api/food/recognize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ imageBase64: base64, model: currentModel }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.error || "识别失败");
          });
        }
        return res.json();
      })
      .then(function (data) {
        stopLoadingAnimation();

        // 组装记录并保存
        var meta = currentPhotoMeta || {};
        var record = {
          id: generateId(),
          imageBase64: thumbBase64 || base64,
          name: data.name || "未知菜品",
          ingredients: data.ingredients || [],
          cookingMethod: data.cookingMethod || "",
          nutrition: data.nutrition || {},
          model: currentModel,
          createdAt: new Date().toISOString(),
          photoTime: meta.photoTime || new Date().toISOString(),
          location: meta.location || null,
        };

        saveRecord(record);

        // 跳转到详情页
        location.href = "detail.html?id=" + record.id;
      })
      .catch(function (err) {
        stopLoadingAnimation();
        showError(err.message || "识别失败，请重试");
      });
  }

  // ===== 语音输入功能（千问 ASR） =====
  var voiceBtn = document.getElementById("voiceBtn");
  var voiceBtnCmd = document.getElementById("voiceBtnCmd");
  var voiceBtnLabel = document.getElementById("voiceBtnLabel");
  var voiceOverlay = document.getElementById("voiceOverlay");
  var voiceCloseBtn = document.getElementById("voiceCloseBtn");
  var voiceRecordingIndicator = document.getElementById("voiceRecordingIndicator");
  var voiceStatus = document.getElementById("voiceStatus");
  var voiceTranscript = document.getElementById("voiceTranscript");
  var voiceStopBtn = document.getElementById("voiceStopBtn");
  var voiceConfirmBtn = document.getElementById("voiceConfirmBtn");

  var isRecording = false;
  var asrWebSocket = null;
  var audioContext = null;
  var mediaStream = null;
  var audioWorkletNode = null;
  var scriptProcessorNode = null;
  var micSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  if (!micSupported) {
    voiceBtnCmd.textContent = "TEXT_INPUT";
    voiceBtnLabel.textContent = "文字记录";
  }

  function openVoicePanel() {
    var settings = getSettings();
    var qwenKey = settings.apiKeys && settings.apiKeys.qwen;

    if (micSupported && !qwenKey) {
      showError("请先在设置页面配置千问（Qwen）的 API Key 以使用语音功能");
      return;
    }

    voiceOverlay.classList.add("visible");
    voiceTranscript.value = "";
    voiceConfirmBtn.style.display = "none";

    if (micSupported) {
      voiceStopBtn.style.display = "";
      voiceRecordingIndicator.classList.remove("hidden");
      startVoiceRecording();
    } else {
      // 降级：纯文字输入模式
      voiceStopBtn.style.display = "none";
      voiceRecordingIndicator.classList.add("hidden");
      voiceStatus.textContent = "请输入食物描述";
      voiceConfirmBtn.style.display = "";
    }
  }

  function closeVoicePanel() {
    if (isRecording) stopVoiceRecording();
    voiceOverlay.classList.remove("visible");
  }

  function startVoiceRecording() {
    isRecording = true;
    voiceStatus.textContent = "正在连接语音服务...";
    voiceTranscript.value = "";

    navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1 }
    }).then(function (stream) {
      if (!isRecording) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        return;
      }
      mediaStream = stream;

      audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      var source = audioContext.createMediaStreamSource(stream);

      // 建立 WebSocket 连接
      var settings = getSettings();
      var qwenKey = settings.apiKeys.qwen;
      var wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
      var wsUrl = wsProtocol + "//" + location.host + "/api/asr/realtime?apiKey=" + encodeURIComponent(qwenKey);

      asrWebSocket = new WebSocket(wsUrl);

      asrWebSocket.onopen = function () {
        if (!isRecording) return;
        voiceStatus.textContent = "正在录音...";

        // 发送 session.update
        asrWebSocket.send(JSON.stringify({
          type: "session.update",
          session: {
            turn_detection: { type: "server_vad" },
            input_audio_format: "pcm16",
            sample_rate: 16000
          }
        }));

        // 开始采集音频
        setupAudioCapture(source);
      };

      asrWebSocket.onmessage = function (e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === "conversation.item.input_audio_transcription.completed") {
            // 最终结果：追加文本
            var current = voiceTranscript.value;
            voiceTranscript.value = current + (msg.transcript || "");
          } else if (msg.type === "conversation.item.input_audio_transcription.text") {
            // 中间结果：显示在 textarea（追加到已确认文本后）
            var confirmed = voiceTranscript.getAttribute("data-confirmed") || "";
            voiceTranscript.value = confirmed + (msg.transcript || "");
          } else if (msg.type === "error") {
            voiceStatus.textContent = "语音识别错误: " + (msg.error || "未知错误");
            console.error("[ASR]", msg);
          }
        } catch (err) {
          console.error("[ASR] 消息解析失败:", err);
        }
      };

      asrWebSocket.onerror = function () {
        voiceStatus.textContent = "语音服务连接失败，请手动输入";
        stopVoiceRecording();
        voiceConfirmBtn.style.display = "";
      };

      asrWebSocket.onclose = function () {
        if (isRecording) {
          stopVoiceRecording();
        }
      };
    }).catch(function (err) {
      console.error("麦克风获取失败:", err);
      isRecording = false;
      voiceRecordingIndicator.classList.add("hidden");
      voiceStopBtn.style.display = "none";
      if (err.name === "NotAllowedError") {
        voiceStatus.textContent = "麦克风权限被拒绝，请手动输入";
      } else {
        voiceStatus.textContent = "无法访问麦克风，请手动输入";
      }
      voiceConfirmBtn.style.display = "";
    });
  }

  function setupAudioCapture(source) {
    // 用于累积音频数据并定时发送
    var audioBuffer = [];
    var sendInterval = null;

    function sendAudioChunk() {
      if (!asrWebSocket || asrWebSocket.readyState !== WebSocket.OPEN) return;
      if (audioBuffer.length === 0) return;

      // 合并所有 buffer
      var totalLen = 0;
      audioBuffer.forEach(function (buf) { totalLen += buf.length; });
      var merged = new Int16Array(totalLen);
      var offset = 0;
      audioBuffer.forEach(function (buf) {
        merged.set(buf, offset);
        offset += buf.length;
      });
      audioBuffer = [];

      // Int16Array → Base64
      var bytes = new Uint8Array(merged.buffer);
      var binary = "";
      for (var i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      var base64 = btoa(binary);

      asrWebSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64
      }));
    }

    // 尝试 AudioWorklet，降级到 ScriptProcessor
    if (audioContext.audioWorklet) {
      audioContext.audioWorklet.addModule("js/pcm-worklet.js").then(function () {
        if (!isRecording) return;
        audioWorkletNode = new AudioWorkletNode(audioContext, "pcm-processor");
        audioWorkletNode.port.onmessage = function (e) {
          audioBuffer.push(new Int16Array(e.data));
        };
        source.connect(audioWorkletNode);
        audioWorkletNode.connect(audioContext.destination);
        sendInterval = setInterval(sendAudioChunk, 100);
      }).catch(function () {
        // AudioWorklet 加载失败，用 ScriptProcessor
        useFallbackProcessor(source, audioBuffer);
        sendInterval = setInterval(sendAudioChunk, 100);
      });
    } else {
      useFallbackProcessor(source, audioBuffer);
      sendInterval = setInterval(sendAudioChunk, 100);
    }

    // 保存清理函数
    audioContext._cleanupCapture = function () {
      if (sendInterval) clearInterval(sendInterval);
      if (audioWorkletNode) {
        audioWorkletNode.disconnect();
        audioWorkletNode = null;
      }
      if (scriptProcessorNode) {
        scriptProcessorNode.disconnect();
        scriptProcessorNode = null;
      }
    };
  }

  function useFallbackProcessor(source, audioBuffer) {
    scriptProcessorNode = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessorNode.onaudioprocess = function (e) {
      var input = e.inputBuffer.getChannelData(0);
      var pcm16 = new Int16Array(input.length);
      for (var i = 0; i < input.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)));
      }
      audioBuffer.push(pcm16);
    };
    source.connect(scriptProcessorNode);
    scriptProcessorNode.connect(audioContext.destination);
  }

  function stopVoiceRecording() {
    isRecording = false;
    voiceRecordingIndicator.classList.add("hidden");
    voiceStopBtn.style.display = "none";
    voiceStatus.textContent = "录音结束，可编辑后确认";
    voiceConfirmBtn.style.display = "";

    // 停止音频采集
    if (audioContext && audioContext._cleanupCapture) {
      audioContext._cleanupCapture();
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(function (t) { t.stop(); });
      mediaStream = null;
    }

    if (audioContext) {
      audioContext.close().catch(function () {});
      audioContext = null;
    }

    // 关闭 WebSocket
    if (asrWebSocket) {
      if (asrWebSocket.readyState === WebSocket.OPEN) {
        try {
          asrWebSocket.send(JSON.stringify({ type: "session.finish" }));
        } catch (e) {}
      }
      asrWebSocket.close();
      asrWebSocket = null;
    }
  }

  voiceBtn.addEventListener("click", openVoicePanel);
  voiceCloseBtn.addEventListener("click", closeVoicePanel);

  voiceOverlay.addEventListener("click", function (e) {
    if (e.target === voiceOverlay) closeVoicePanel();
  });

  voiceStopBtn.addEventListener("click", function () {
    stopVoiceRecording();
  });

  // textarea 有内容时自动显示确认按钮
  voiceTranscript.addEventListener("input", function () {
    if (voiceTranscript.value.trim()) {
      voiceConfirmBtn.style.display = "";
    }
  });

  voiceConfirmBtn.addEventListener("click", function () {
    var text = voiceTranscript.value.trim();
    if (!text) return;

    closeVoicePanel();
    recognizeText(text);
  });

  function recognizeText(text) {
    var settings = getSettings();
    var currentModel = settings.model || DEFAULT_MODEL;
    var config = MODEL_CONFIG[currentModel];

    if (!config) {
      showError("不支持的模型，请在设置中切换");
      return;
    }

    var apiKey = settings.apiKeys[config.provider];
    if (!apiKey) {
      showError("请先在设置页面配置 " + config.label + " 的 API Key");
      return;
    }

    startLoadingAnimation();

    fetch("/api/food/recognize-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ text: text, model: currentModel }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.error || "识别失败");
          });
        }
        return res.json();
      })
      .then(function (data) {
        stopLoadingAnimation();

        var record = {
          id: generateId(),
          imageBase64: "",
          name: data.name || "未知菜品",
          ingredients: data.ingredients || [],
          cookingMethod: data.cookingMethod || "",
          nutrition: data.nutrition || {},
          model: currentModel,
          createdAt: new Date().toISOString(),
          photoTime: new Date().toISOString(),
          location: null,
          source: "voice",
          voiceText: text,
        };

        // 尝试获取位置
        getBrowserLocation(function (pos) {
          if (pos) {
            reverseGeocode(pos.lat, pos.lng, function (address) {
              record.location = { lat: pos.lat, lng: pos.lng, address: address || "" };
              saveRecord(record);
              location.href = "detail.html?id=" + record.id;
            });
          } else {
            saveRecord(record);
            location.href = "detail.html?id=" + record.id;
          }
        });
      })
      .catch(function (err) {
        stopLoadingAnimation();
        showError(err.message || "识别失败，请重试");
      });
  }

  // 在终端消息区追加错误消息
  function showError(msg) {
    var el = document.createElement("div");
    el.className = "terminal-msg terminal-msg--system";
    el.style.color = "var(--color-danger)";
    el.innerHTML = '<span class="msg-prefix">&gt; </span>[ERROR] ' + escapeHtml(msg);
    terminalMessages.appendChild(el);
    terminalMessages.scrollTop = terminalMessages.scrollHeight;

    // 3 秒后追加恢复消息
    setTimeout(function () {
      var recover = document.createElement("div");
      recover.className = "terminal-msg terminal-msg--ai";
      var cursor = document.createElement("span");
      cursor.className = "typing-cursor";
      recover.appendChild(cursor);
      typeText(recover, "没关系，请检查设置后再试一次。", cursor);
      terminalMessages.appendChild(recover);
      terminalMessages.scrollTop = terminalMessages.scrollHeight;
    }, 1500);
  }
})();
