const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

const TIER_CONFIG = {
  1: { label: "体验版", model: "glm-4v-flash", provider: "zhipu" },
  2: { label: "标准版", model: "gemini-2.0-flash", provider: "gemini" },
  3: { label: "高级版", model: "gpt-4o", provider: "openai" },
};

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

async function callZhipu(imageBase64, apiKey) {
  const res = await fetch(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "glm-4v-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SYSTEM_PROMPT },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("智谱 API 错误:", res.status, err);
    throw new Error(`智谱 API 调用失败 (${res.status})`);
  }

  const data = await res.json();
  console.log("智谱响应状态:", res.status);
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function callGemini(imageBase64, apiKey) {
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("无效的图片格式");
  const mimeType = match[1];
  const base64Data = match[2];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Gemini API 错误:", res.status, err);
    throw new Error(`Gemini API 调用失败 (${res.status})`);
  }

  const data = await res.json();
  console.log("Gemini 响应状态:", res.status);
  return (
    (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) ||
    ""
  );
}

async function callOpenAI(imageBase64, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "image_url", image_url: { url: imageBase64 } },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("OpenAI API 错误:", res.status, err);
    throw new Error(`OpenAI API 调用失败 (${res.status})`);
  }

  const data = await res.json();
  console.log("OpenAI 响应状态:", res.status);
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

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

// POST /api/food/recognize
router.post("/recognize", async (req, res) => {
  try {
    const { imageBase64, tier } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "缺少图片数据" });
    }

    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "缺少 API Key" });
    }

    const config = TIER_CONFIG[tier] || TIER_CONFIG[1];
    console.log(
      `食物识别请求 - 等级: ${config.label}, 模型: ${config.model}`
    );

    var rawContent;

    switch (config.provider) {
      case "zhipu":
        rawContent = await callZhipu(imageBase64, apiKey);
        break;
      case "gemini":
        rawContent = await callGemini(imageBase64, apiKey);
        break;
      case "openai":
        rawContent = await callOpenAI(imageBase64, apiKey);
        break;
      default:
        return res.status(400).json({ error: "不支持的模型" });
    }

    const parsed = parseAiResponse(rawContent);

    res.json({
      name: parsed.name || "未知菜品",
      ingredients: parsed.ingredients || [],
      cookingMethod: parsed.cookingMethod || "",
      tags: parsed.tags || [],
      description: parsed.description || "",
      model: config.model,
    });
  } catch (err) {
    console.error("食物识别错误:", err);
    const message = err instanceof Error ? err.message : "识别失败";
    res.status(500).json({ error: message });
  }
});

module.exports = router;
