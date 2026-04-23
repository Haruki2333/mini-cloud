/**
 * 对话路由 — 扑克教练
 *
 * SSE 对话接口（分析手牌、Leak 识别、追问）：
 *   POST /api/poker/completions
 *
 * 直接数据接口（无 LLM）：
 *   POST /api/poker/hands       — 录入新手牌
 *   GET  /api/poker/hands       — 列出手牌
 *   GET  /api/poker/hands/:id   — 手牌详情 + 分析结果
 *   GET  /api/poker/leaks       — Leak 列表
 *
 * 导出 pokerRouter（挂载到 /api/poker）。
 */

const express = require("express");
const { getModelInfo } = require("../services/core/llm");
const { createBrain } = require("../services/core/brain");
const { createSkillRegistry } = require("../services/core/skill-registry");
const {
  POKER_SYSTEM_PROMPT,
  enhancePrompt,
} = require("../services/poker-coach/brain-config");
const {
  getHandDetailDefinition,
  saveAnalysisDefinition,
  getUserAnalysesDefinition,
  saveLeaksDefinition,
  executeGetHandDetail,
  executeSaveAnalysis,
  executeGetUserAnalyses,
  executeSaveLeaks,
} = require("../services/poker-coach/skills");
const dao = require("../services/poker-coach/dao");

// ===== 组装技能集和 Brain =====

const pokerSkills = createSkillRegistry({
  get_hand_detail: {
    definition: getHandDetailDefinition,
    execute: executeGetHandDetail,
  },
  save_analysis: {
    definition: saveAnalysisDefinition,
    execute: executeSaveAnalysis,
  },
  get_user_analyses: {
    definition: getUserAnalysesDefinition,
    execute: executeGetUserAnalyses,
  },
  save_leaks: {
    definition: saveLeaksDefinition,
    execute: executeSaveLeaks,
  },
});

const pokerBrain = createBrain({
  systemPrompt: POKER_SYSTEM_PROMPT,
  skills: pokerSkills,
  enhancePrompt,
});

// ===== 用户标识 =====

function extractAnonToken(req) {
  return req.headers["x-wx-openid"] || req.headers["x-anon-token"] || null;
}

async function resolveUserId(req) {
  const token = extractAnonToken(req);
  if (!token) return null;
  return dao.findOrCreateUser(token);
}

async function withUser(req, res, fn) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }
    await fn(userId);
  } catch (err) {
    console.error("[PokerRoute]", err);
    res.status(500).json({ error: "服务内部错误" });
  }
}

// ===== SSE：对话（分析 + 追问 + Leak）=====

async function handleCompletions(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "缺少 API Key，请在设置页配置" });
    }

    const { messages } = req.body;
    let model = req.body.model || "qwen3.5-plus";

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "消息列表不能为空" });
    }

    const modelInfo = getModelInfo(model);
    if (!modelInfo) {
      return res.status(400).json({ error: "不支持的模型: " + model });
    }

    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识（X-Anon-Token 或 x-wx-openid）" });
    }

    const totalHands = await dao.countHands(userId);
    const context = { userId, totalHands };

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for await (const event of pokerBrain.think({ messages, model, apiKey, userId, context })) {
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[PokerRoute] SSE 错误:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "服务内部错误" });
    } else {
      res.write("data: " + JSON.stringify({ type: "error", message: err.message }) + "\n\n");
      res.end();
    }
  }
}

// ===== REST：手牌 CRUD =====

function serializeActions(actionsArr) {
  if (!actionsArr || actionsArr.length === 0) return null;
  return actionsArr.map(function (a) {
    var label = a.position;
    var text = label + " " + a.action;
    if (a.amount != null) text += " " + a.amount;
    return text;
  }).join("，");
}

async function handleCreateHand(req, res) {
  await withUser(req, res, async (userId) => {
    const data = { ...req.body };

    // 从 actions JSON 自动生成文本版本回填旧字段（向后兼容）
    if (data.actions && !data.preflop_actions) {
      data.preflop_actions = serializeActions(data.actions.preflop);
      data.flop_actions = serializeActions(data.actions.flop) || data.flop_actions;
      data.turn_actions = serializeActions(data.actions.turn) || data.turn_actions;
      data.river_actions = serializeActions(data.actions.river) || data.river_actions;
    }

    // 从 opponents JSON 自动生成 opponent_notes 文本（向后兼容）
    if (data.opponents && !data.opponent_notes) {
      data.opponent_notes = data.opponents.map(function (o) {
        return o.position + (o.stack_bb ? " (" + o.stack_bb + "BB)" : "");
      }).join("，");
    }

    const { blind_level, hero_position, hero_cards, preflop_actions } = data;
    if (!blind_level || !hero_position || !hero_cards || !preflop_actions) {
      return res.status(400).json({ error: "缺少必填字段：blind_level / hero_position / hero_cards / preflop_actions" });
    }
    const handId = await dao.createHand(userId, data);
    res.json({ hand_id: handId });
  });
}

async function handleListHands(req, res) {
  await withUser(req, res, async (userId) => {
    const hands = await dao.listHands(userId);
    res.json({ total: hands.length, hands });
  });
}

async function handleGetHand(req, res) {
  await withUser(req, res, async (userId) => {
    const handId = parseInt(req.params.id, 10);
    if (!handId) return res.status(400).json({ error: "无效的手牌 ID" });

    const hand = await dao.getHandWithAnalyses(handId, userId);
    if (!hand) return res.status(404).json({ error: "手牌不存在" });

    res.json(hand);
  });
}

async function handleGetLeaks(req, res) {
  await withUser(req, res, async (userId) => {
    const [leaks, totalHands] = await Promise.all([
      dao.getLeaks(userId),
      dao.countHands(userId),
    ]);
    res.json({ total_hands: totalHands, leaks });
  });
}

// ===== 路由组装 =====

const pokerRouter = express.Router();

pokerRouter.post("/completions", handleCompletions);
pokerRouter.post("/hands", handleCreateHand);
pokerRouter.get("/hands", handleListHands);
pokerRouter.get("/hands/:id", handleGetHand);
pokerRouter.get("/leaks", handleGetLeaks);

module.exports = { pokerRouter };
