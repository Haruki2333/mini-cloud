/**
 * 对话路由 — 冒险游戏
 *
 * 通过 createBrain 工厂 per-request 创建 brain 实例，
 * 通过闭包将 imageApiKey 绑定到 advance_story 技能。
 * 导出 adventureRouter（挂载到 /api/adventure）。
 */

const express = require("express");
const { getModelInfo } = require("../services/core/llm");
const { createBrain } = require("../services/core/brain");
const {
  ADVENTURE_SYSTEM_PROMPT,
  enhancePrompt,
} = require("../services/adventure-game/brain-config");
const {
  advanceStoryDefinition,
  createAdvanceStoryExecutor,
} = require("../services/adventure-game/skills");

// ===== SSE 对话处理 =====

async function handleCompletions(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "缺少 API Key，请在设置中配置" });
    }

    const { messages, context } = req.body;
    let model = req.body.model || "qwen3.5-plus";

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "消息列表不能为空" });
    }

    const modelInfo = getModelInfo(model);
    if (!modelInfo) {
      return res.status(400).json({ error: "不支持的模型: " + model });
    }

    // Per-request 创建技能实例（闭包绑定 apiKey 和 provider）
    const imageApiKey = req.headers["x-image-api-key"] || apiKey;
    const provider = modelInfo.provider;

    const executeAdvanceStory = createAdvanceStoryExecutor(
      imageApiKey,
      provider
    );

    const skills = {
      definitions: [advanceStoryDefinition],
      execute: async function (name, args) {
        if (name === "advance_story") {
          return executeAdvanceStory(args);
        }
        return { success: false, message: "未知技能: " + name };
      },
    };

    const brain = createBrain({
      systemPrompt: ADVENTURE_SYSTEM_PROMPT,
      skills,
      enhancePrompt,
    });

    // SSE 流式响应
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for await (const event of brain.think({
      messages,
      model,
      apiKey,
      context: context || {},
    })) {
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[Adventure] 调用失败:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(
        "data: " +
          JSON.stringify({ type: "error", message: err.message }) +
          "\n\n"
      );
      res.end();
    }
  }
}

// ===== 路由 =====

const adventureRouter = express.Router();
adventureRouter.post("/completions", handleCompletions);

module.exports = { adventureRouter };
