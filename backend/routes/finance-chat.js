const express = require("express");
const { getModelInfo } = require("../services/llm");
const { think } = require("../services/finance-brain");

const router = express.Router();

router.post("/completions", async (req, res) => {
  try {
    var apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "缺少 API Key，请在个人资料页配置" });
    }

    var { messages, model, profile } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "消息列表不能为空" });
    }

    model = model || "qwen3.5-plus";
    var modelInfo = getModelInfo(model);
    if (!modelInfo) {
      return res.status(400).json({ error: "不支持的模型: " + model });
    }

    // SSE 流式响应
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for await (const event of think({ messages, model, apiKey, profile })) {
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[FinanceChat] 调用失败:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(
        "data: " + JSON.stringify({ type: "error", message: err.message }) + "\n\n"
      );
      res.end();
    }
  }
});

module.exports = router;
