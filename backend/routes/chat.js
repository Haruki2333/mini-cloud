const express = require("express");
const { chat, getModelInfo } = require("../services/llm");

const router = express.Router();

const SYSTEM_PROMPT = `你是「光明生活助理」，一个温暖友善、简洁实用的 AI 助手。
你的职责是帮助用户处理日常生活中的各种问题，包括但不限于：生活建议、知识问答、日程规划、情感支持等。
回复要求：
- 简洁明了，避免冗长
- 语气温暖亲切，像一个靠谱的朋友
- 如果用户提供了个人资料，适当结合用户信息给出个性化建议
- 使用中文回复`;

function buildSystemPrompt(profile) {
  var parts = [SYSTEM_PROMPT];
  if (profile) {
    var info = [];
    if (profile.name) info.push("称呼：" + profile.name);
    if (profile.age) info.push("年龄：" + profile.age);
    if (profile.gender) info.push("性别：" + profile.gender);
    if (profile.hobbies) info.push("爱好：" + profile.hobbies);
    if (profile.bio) info.push("个人简介：" + profile.bio);
    if (info.length > 0) {
      parts.push("\n用户资料：\n" + info.join("\n"));
    }
  }
  return parts.join("");
}

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

    // 构建完整消息列表，注入 system prompt
    var fullMessages = [
      { role: "system", content: buildSystemPrompt(profile) },
      ...messages,
    ];

    var result = await chat(model, fullMessages, apiKey);
    res.json({ content: result.content, model: model });
  } catch (err) {
    console.error("[Chat] 调用失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
