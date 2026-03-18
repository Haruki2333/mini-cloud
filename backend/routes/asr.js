const { WebSocketServer } = require("ws");
const WebSocket = require("ws");
const url = require("url");

const DASHSCOPE_WS_URL =
  "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime";

function setupAsrWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const pathname = url.parse(req.url).pathname;
    if (pathname !== "/api/asr/realtime") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (clientWs, req) => {
    const query = url.parse(req.url, true).query;
    const apiKey = query.apiKey;

    if (!apiKey) {
      clientWs.send(
        JSON.stringify({ type: "error", error: "缺少 apiKey 参数" })
      );
      clientWs.close();
      return;
    }

    // 连接 DashScope WebSocket
    const dsWs = new WebSocket(DASHSCOPE_WS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let dsReady = false;
    const pendingMessages = [];

    dsWs.on("open", () => {
      dsReady = true;
      // 发送积压消息
      pendingMessages.forEach((msg) => dsWs.send(msg));
      pendingMessages.length = 0;
    });

    dsWs.on("message", (data) => {
      // DashScope → 前端：透传
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(typeof data === "string" ? data : data.toString());
      }
    });

    dsWs.on("error", (err) => {
      console.error("[ASR 代理] DashScope 连接错误:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "error",
            error: "语音识别服务连接失败: " + err.message,
          })
        );
        clientWs.close();
      }
    });

    dsWs.on("close", () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });

    // 前端 → DashScope：透传
    clientWs.on("message", (data) => {
      const msg = typeof data === "string" ? data : data.toString();
      if (dsReady) {
        dsWs.send(msg);
      } else {
        pendingMessages.push(msg);
      }
    });

    clientWs.on("close", () => {
      if (dsWs.readyState === WebSocket.OPEN) {
        dsWs.close();
      }
    });

    clientWs.on("error", (err) => {
      console.error("[ASR 代理] 客户端连接错误:", err.message);
      if (dsWs.readyState === WebSocket.OPEN) {
        dsWs.close();
      }
    });
  });
}

module.exports = { setupAsrWebSocket };
