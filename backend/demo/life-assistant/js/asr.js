/**
 * ASR 语音识别模块
 * 封装 WebSocket 实时语音转写功能
 */
var ASR = (function () {
  var isRecording = false;
  var mediaStream = null;
  var audioContext = null;
  var audioWorkletNode = null;
  var scriptProcessorNode = null;
  var asrWebSocket = null;
  var callbacks = null;

  function start(apiKey, cbs) {
    if (isRecording) return;
    isRecording = true;
    callbacks = cbs || {};

    if (callbacks.onRecording) callbacks.onRecording("connecting");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isRecording = false;
      if (callbacks.onError) callbacks.onError("当前环境不支持麦克风访问，请使用 HTTPS 访问页面");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
      .then(function (stream) {
        if (!isRecording) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        mediaStream = stream;
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        var source = audioContext.createMediaStreamSource(stream);

        var wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
        var wsUrl = wsProtocol + "//" + location.host + "/api/asr/realtime?apiKey=" + encodeURIComponent(apiKey);
        asrWebSocket = new WebSocket(wsUrl);

        asrWebSocket.onopen = function () {
          if (!isRecording) return;
          if (callbacks.onRecording) callbacks.onRecording("recording");

          asrWebSocket.send(JSON.stringify({
            type: "session.update",
            session: {
              turn_detection: { type: "server_vad" },
              input_audio_format: "pcm16",
              sample_rate: 16000,
            },
          }));

          setupAudioCapture(source);
        };

        asrWebSocket.onmessage = function (e) {
          try {
            var msg = JSON.parse(e.data);
            if (!callbacks) return;
            if (msg.type === "conversation.item.input_audio_transcription.completed") {
              if (callbacks.onFinalResult) callbacks.onFinalResult(msg.transcript || "");
            } else if (msg.type === "conversation.item.input_audio_transcription.text") {
              if (callbacks.onTranscript) callbacks.onTranscript(msg.transcript || "");
            } else if (msg.type === "error") {
              if (callbacks.onError) callbacks.onError(msg.error || "未知错误");
            }
          } catch (err) {
            console.error("[ASR] 消息解析失败:", err);
          }
        };

        asrWebSocket.onerror = function () {
          if (callbacks && callbacks.onError) callbacks.onError("语音服务连接失败");
          stop();
        };

        asrWebSocket.onclose = function () {
          if (isRecording) stop();
        };
      })
      .catch(function (err) {
        console.error("麦克风获取失败:", err);
        isRecording = false;
        if (err.name === "NotAllowedError") {
          if (callbacks.onError) callbacks.onError("麦克风权限被拒绝，请在浏览器设置中允许麦克风访问");
        } else {
          if (callbacks.onError) callbacks.onError("无法访问麦克风: " + err.message);
        }
      });
  }

  function setupAudioCapture(source) {
    var audioBuffer = [];
    var sendInterval = null;

    function sendAudioChunk() {
      if (!asrWebSocket || asrWebSocket.readyState !== WebSocket.OPEN) return;
      if (audioBuffer.length === 0) return;

      var totalLen = 0;
      audioBuffer.forEach(function (buf) { totalLen += buf.length; });
      var merged = new Int16Array(totalLen);
      var offset = 0;
      audioBuffer.forEach(function (buf) {
        merged.set(buf, offset);
        offset += buf.length;
      });
      audioBuffer = [];

      var bytes = new Uint8Array(merged.buffer);
      var binary = "";
      for (var i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      var base64 = btoa(binary);

      asrWebSocket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64,
      }));
    }

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
        useFallbackProcessor(source, audioBuffer);
        sendInterval = setInterval(sendAudioChunk, 100);
      });
    } else {
      useFallbackProcessor(source, audioBuffer);
      sendInterval = setInterval(sendAudioChunk, 100);
    }

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

  function stop() {
    isRecording = false;

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

    if (asrWebSocket) {
      if (asrWebSocket.readyState === WebSocket.OPEN) {
        try {
          asrWebSocket.send(JSON.stringify({ type: "session.finish" }));
        } catch (e) {}
      }
      asrWebSocket.close();
      asrWebSocket = null;
    }

    callbacks = null;
  }

  return {
    get isRecording() { return isRecording; },
    start: start,
    stop: stop,
  };
})();
