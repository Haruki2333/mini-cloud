const express = require("express");
const { chat, getModels, getModelInfo } = require("../services/llm");

const router = express.Router();

const SYSTEM_PROMPT = `你是一个美食识别专家。请分析用户提供的食物照片，以 JSON 格式返回以下信息：
{
  "name": "菜名",
  "ingredients": ["食材1", "食材2", ...],
  "cookingMethod": "烹饪方式",
  "tags": ["标签1", "标签2", ...],
  "description": "一段50字左右的美食描述，生动有趣"
}
标签可以包含菜系（川菜、粤菜等）、口味（辣、清淡等）、类型（家常菜、甜品等）。
只返回合法 JSON，不要包含 markdown 代码块标记或其他内容。`;

function parseAiResponse(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    throw new Error("无法解析 AI 返回的 JSON");
  }
}

// GET /api/food/models — 可用模型列表
router.get("/models", (req, res) => {
  res.json(getModels());
});

// POST /api/food/recognize — 食物识别
router.post("/recognize", async (req, res) => {
  try {
    const { imageBase64, model: modelId } = req.body;
    const effectiveModel = modelId || "glm-4.6v-flash";

    if (!imageBase64) {
      return res.status(400).json({ error: "缺少图片数据" });
    }

    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "缺少 API Key" });
    }

    const info = getModelInfo(effectiveModel);
    if (!info) {
      return res.status(400).json({ error: "不支持的模型" });
    }

    console.log(`食物识别请求 - 模型: ${info.label} (${effectiveModel})`);

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: SYSTEM_PROMPT },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ];

    const result = await chat(effectiveModel, messages, apiKey);

    let parsed;
    try {
      parsed = parseAiResponse(result.content);
    } catch (parseErr) {
      console.error(`AI 返回内容解析失败 - 模型: ${effectiveModel}, 原始内容:`, result.content);
      throw parseErr;
    }

    const usageStr = result.usage ? `, tokens: ${result.usage.total_tokens}` : "";
    console.log(`食物识别完成 - 模型: ${info.label}, 菜名: ${parsed.name || "未知"}${usageStr}`);

    res.json({
      name: parsed.name || "未知菜品",
      ingredients: parsed.ingredients || [],
      cookingMethod: parsed.cookingMethod || "",
      tags: parsed.tags || [],
      description: parsed.description || "",
      model: effectiveModel,
    });
  } catch (err) {
    console.error(`食物识别失败 - 模型: ${effectiveModel}, 错误: ${err.message}`);
    const message = err instanceof Error ? err.message : "识别失败";
    res.status(500).json({ error: message });
  }
});

module.exports = router;
