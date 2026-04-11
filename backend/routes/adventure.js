/**
 * 对话路由 — 冒险游戏
 *
 * 通过 createBrain 工厂 per-request 创建 brain 实例。
 * 文生图已从 advance_story 工具中剥离：路由层在 tool_result 产出后
 * 立即 fire-and-forget 触发 generateImage，图片就绪后通过独立的
 * scene_image / scene_image_error 事件异步下发，避免阻塞 narrative。
 *
 * 流式叙述：brain 在流式调用 LLM 时透传 args_delta 事件，路由层通过
 * createNarrativeExtractor 实时从 advance_story 的参数流中抠出 narrative
 * 文本，以 narrative_delta 事件逐片下发，前端可立即开始渲染，无需等待全量响应。
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

// ===== Narrative 流式提取状态机 =====

/**
 * 从 advance_story 工具的流式参数 JSON 中实时提取 narrative 字段值。
 *
 * 参数 JSON 形如：{"narrative":"故事文本...","progress":2,...}
 * 状态机在流中定位 "narrative":" 起始标记，随后逐字提取文本内容，
 * 遇到未转义的 " 时结束提取。完整处理 JSON 字符串转义序列。
 *
 * @returns {function(chunk: string): string}  feed 函数，返回本次提取到的字符
 */
function createNarrativeExtractor() {
  const TARGET = '"narrative":"';
  let state = "scanning"; // 'scanning' | 'in_value' | 'done'
  let pending = "";

  return function feed(chunk) {
    if (state === "done") return "";
    pending += chunk;
    let extracted = "";

    if (state === "scanning") {
      const idx = pending.indexOf(TARGET);
      if (idx >= 0) {
        state = "in_value";
        pending = pending.slice(idx + TARGET.length);
      } else {
        // 保留尾部（TARGET.length-1 个字符）防止跨 chunk 时匹配失败
        if (pending.length > TARGET.length - 1) {
          pending = pending.slice(-(TARGET.length - 1));
        }
        return "";
      }
    }

    if (state === "in_value") {
      let i = 0;
      while (i < pending.length) {
        const ch = pending[i];
        if (ch === "\\") {
          if (i + 1 < pending.length) {
            const next = pending[i + 1];
            if (next === "n") extracted += "\n";
            else if (next === "t") extracted += "\t";
            else if (next === '"') extracted += '"';
            else if (next === "\\") extracted += "\\";
            else extracted += ch + next;
            i += 2;
          } else {
            // 转义字符跨 chunk，等待下一片
            pending = pending.slice(i);
            return extracted;
          }
        } else if (ch === '"') {
          // narrative 字段结束
          state = "done";
          pending = "";
          break;
        } else {
          extracted += ch;
          i++;
        }
      }
      if (state === "in_value") {
        pending = ""; // 本批已全部提取
      }
    }

    return extracted;
  };
}

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

    // 异步图生成任务队列
    let turnCounter = 0;
    const pendingImages = [];

    // Narrative 流式提取器（每次请求一个实例，仅提取第一轮叙述）
    const feedNarrative = createNarrativeExtractor();

    for await (const event of brain.think({
      messages,
      model,
      apiKey,
      context: context || {},
    })) {
      // args_delta：从流中提取 narrative 文本并实时下发，不转发原始事件
      if (event.type === "args_delta") {
        if (event.name === "advance_story") {
          const narChunk = feedNarrative(event.chunk);
          if (narChunk) {
            writeEvent({ type: "narrative_delta", content: narChunk });
          }
        }
        continue;
      }

      writeEvent(event);

      // 图片生成策略：整局游戏只在两个节点生成图片 —— 开局（设置了 title 的首场景）
      // 和结局（is_ending = true）。即便 LLM 意外在其他轮次填入 image_prompt 也会被忽略。
      const shouldGenerateImage =
        event.type === "tool_result" &&
        event.name === "advance_story" &&
        event.result &&
        event.result.image_prompt &&
        imageApiKey &&
        (event.result.title || event.result.is_ending);

      if (shouldGenerateImage) {
        const turnId = ++turnCounter;
        const prompt = event.result.image_prompt;

        writeEvent({ type: "scene_image_pending", turn_id: turnId });

        const task = generateImage(prompt, imageApiKey, provider)
          .then((url) => {
            if (url) {
              writeEvent({ type: "scene_image", turn_id: turnId, url });
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
