/**
 * 对话路由 — 冒险游戏
 *
 * 通过 createBrain 工厂 per-request 创建 brain 实例。
 * 文生图已从 advance_story 工具中剥离：路由层在 tool_result 产出后
 * 立即 fire-and-forget 触发 generateImage，图片就绪后通过独立的
 * scene_image / scene_image_error 事件异步下发，避免阻塞 narrative。
 *
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
  generateImage,
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

    // Per-request 创建技能实例
    const imageApiKey = req.headers["x-image-api-key"] || apiKey;
    const provider = modelInfo.provider;

    const executeAdvanceStory = createAdvanceStoryExecutor();

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

    // 安全写 SSE：若客户端已断开则忽略
    let clientClosed = false;
    req.on("close", () => {
      clientClosed = true;
    });
    function writeEvent(payload) {
      if (clientClosed) return;
      try {
        res.write("data: " + JSON.stringify(payload) + "\n\n");
      } catch (e) {
        clientClosed = true;
      }
    }

    // 异步图生成任务队列：循环结束后需要 allSettled，避免事件流过早关闭
    let turnCounter = 0;
    const pendingImages = [];

    for await (const event of brain.think({
      messages,
      model,
      apiKey,
      context: context || {},
    })) {
      writeEvent(event);

      if (
        event.type === "tool_result" &&
        event.name === "advance_story" &&
        event.result &&
        event.result.image_prompt &&
        imageApiKey
      ) {
        const turnId = ++turnCounter;
        const prompt = event.result.image_prompt;

        // 先告知前端本轮有图在路上（用于显示角标）
        writeEvent({ type: "scene_image_pending", turn_id: turnId });

        const task = generateImage(prompt, imageApiKey, provider)
          .then((url) => {
            if (url) {
              writeEvent({
                type: "scene_image",
                turn_id: turnId,
                url,
              });
            } else {
              writeEvent({
                type: "scene_image_error",
                turn_id: turnId,
                message: "图像生成失败",
              });
            }
          })
          .catch((err) => {
            writeEvent({
              type: "scene_image_error",
              turn_id: turnId,
              message: (err && err.message) || "图像生成异常",
            });
          });
        pendingImages.push(task);
      }
    }

    // 等待所有异步图片任务 settle 后再关闭流
    await Promise.allSettled(pendingImages);
    if (!clientClosed) {
      try {
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (_) {
        // ignore
      }
    }
  } catch (err) {
    console.error("[Adventure] 调用失败:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      try {
        res.write(
          "data: " +
            JSON.stringify({ type: "error", message: err.message }) +
            "\n\n"
        );
        res.end();
      } catch (_) {
        // ignore
      }
    }
  }
}

// ===== 路由 =====

const adventureRouter = express.Router();
adventureRouter.post("/completions", handleCompletions);

module.exports = { adventureRouter };
