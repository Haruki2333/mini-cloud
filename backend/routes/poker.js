/**
 * 对话路由 — 扑克教练
 *
 * SSE 对话接口（分析手牌、Leak 识别、追问）：
 *   POST /api/poker/completions
 *
 * 直接数据接口（无 LLM）：
 *   POST   /api/poker/hands       — 录入新手牌
 *   GET    /api/poker/hands       — 列出手牌
 *   GET    /api/poker/hands/:id   — 手牌详情 + 分析结果
 *   DELETE /api/poker/hands/:id   — 删除手牌（级联删除分析与评估）
 *   GET    /api/poker/leaks       — Leak 列表
 *
 * 多模型评估接口（SSE）：
 *   POST /api/poker/eval/runs       — 触发多模型并发评估
 *   GET  /api/poker/eval/runs       — 列出手牌历史评估批次
 *   GET  /api/poker/eval/runs/:id   — 评估批次详情
 *
 * 导出 pokerRouter（挂载到 /api/poker）。
 */

const express = require("express");
const { getModelInfo } = require("../services/core/llm");
const dao = require("../services/poker-coach/dao");
const { runAnalysis, runLeak, runChat } = require("../services/poker-coach/agent");
const { runEvaluation } = require("../services/poker-coach/evaluator");
const { serializeActions } = require("../services/poker-coach/hand-context");

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
    const model = req.body.model || "gpt-5.4";
    const handId = req.body.hand_id ? parseInt(req.body.hand_id, 10) : null;
    const analyzeLeaks = !!req.body.analyze_leaks;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "消息列表不能为空" });
    }

    if (!getModelInfo(model)) {
      return res.status(400).json({ error: "不支持的模型: " + model });
    }

    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识（X-Anon-Token 或 x-wx-openid）" });
    }

    const [totalHands, analyzedHands] = await Promise.all([
      dao.countHands(userId),
      dao.countAnalyzedHands(userId),
    ]);

    // 按请求类型预取数据并选择对应 Agent
    let agentIter;

    if (handId) {
      console.log(`[PokerRoute] 分析模式 hand_id=${handId}`);
      const [hand, recentAnalyses] = await Promise.all([
        dao.getHandWithAnalyses(handId, userId),
        dao.getUserAnalyses(userId, 50),
      ]);
      if (!hand) {
        return res.status(404).json({ error: "手牌不存在或无权访问" });
      }
      // 剥离已有分析：避免 LLM 看到旧结果后直接复述而不重新分析
      const { analyses: _existingAnalyses, ...handWithoutAnalyses } = hand;
      agentIter = runAnalysis({
        hand: handWithoutAnalyses,
        // 排除当前手牌：避免"重新分析"时模型照搬旧分析
        recentAnalyses: recentAnalyses.filter((a) => a.hand_id !== handId),
        totalHands,
        analyzedHands,
        model,
        apiKey,
        userId,
      });
    } else if (analyzeLeaks) {
      console.log("[PokerRoute] Leak 分析模式");
      const recentAnalyses = await dao.getUserAnalyses(userId, 50);
      agentIter = runLeak({
        recentAnalyses,
        totalHands,
        analyzedHands,
        model,
        apiKey,
        userId,
      });
    } else {
      console.log("[PokerRoute] 追问对话模式");
      agentIter = runChat({
        messages,
        totalHands,
        analyzedHands,
        model,
        apiKey,
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    for await (const event of agentIter) {
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[PokerRoute] SSE 错误:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "服务内部错误" });
    } else {
      res.write("data: " + JSON.stringify({ type: "error", message: err.message }) + "\n\n");
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}

// ===== REST：手牌 CRUD =====

async function handleCreateHand(req, res) {
  await withUser(req, res, async (userId) => {
    const data = { ...req.body };
    const { blind_level, hero_position, hero_cards } = data;
    // 接受新版 actions JSON 或旧版文本字段
    const hasPreflopActions = data.preflop_actions ||
      (data.actions?.preflop && data.actions.preflop.length > 0);
    if (!blind_level || !hero_position || !hero_cards || !hasPreflopActions) {
      return res.status(400).json({ error: "缺少必填字段：blind_level / hero_position / hero_cards / preflop_actions" });
    }
    // 从 actions JSON 自动生成文本版本回填旧字段（向后兼容）
    if (data.actions && !data.preflop_actions) {
      data.preflop_actions = serializeActions(data.actions.preflop);
      data.flop_actions = serializeActions(data.actions.flop) || data.flop_actions;
      data.turn_actions = serializeActions(data.actions.turn) || data.turn_actions;
      data.river_actions = serializeActions(data.actions.river) || data.river_actions;
    }
    // 从 opponents JSON 自动生成 opponent_notes 文本（向后兼容）
    if (data.opponents && !data.opponent_notes) {
      data.opponent_notes = data.opponents
        .map((o) => o.position + (o.stack_bb ? " (" + o.stack_bb + "BB)" : ""))
        .join("，");
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

async function handleDeleteHand(req, res) {
  await withUser(req, res, async (userId) => {
    const handId = parseInt(req.params.id, 10);
    if (!handId) return res.status(400).json({ error: "无效的手牌 ID" });

    const deleted = await dao.deleteHand(handId, userId);
    if (!deleted) return res.status(404).json({ error: "手牌不存在" });

    console.log(`[PokerRoute] 手牌已删除 id=${handId} user=${userId}`);
    res.json({ success: true });
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

// ===== SSE：多模型评估 =====

async function handleEvalRun(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "缺少 API Key" });

    const handId = parseInt(req.body.hand_id, 10);
    if (!handId) return res.status(400).json({ error: "缺少 hand_id" });

    console.log(`[PokerRoute] eval 接收 hand=${handId} apiKeyLen=${apiKey.length} models=${(req.body.model_ids || []).join(",") || "all"}`);

    let userId;
    try {
      userId = await resolveUserId(req);
    } catch (dbErr) {
      console.error("[PokerRoute] eval resolveUserId DB 错误:", dbErr.message, dbErr.stack);
      return res.status(500).json({ error: "数据库连接异常，请稍后重试" });
    }
    if (!userId) return res.status(401).json({ error: "缺少用户标识" });

    const belongs = await dao.handBelongsToUser(handId, userId);
    if (!belongs) return res.status(404).json({ error: "手牌不存在" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    req.on("close", () => console.log(`[PokerRoute] eval SSE 连接关闭 hand=${handId}`));

    const modelIds = Array.isArray(req.body.model_ids) ? req.body.model_ids : null;
    for await (const event of runEvaluation({ userId, handId, modelIds, apiKey })) {
      if (res.writableEnded) {
        console.warn(`[PokerRoute] eval SSE 连接已结束，跳过事件 type=${event.type}`);
        continue;
      }
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }

    if (!res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (err) {
    console.error("[PokerRoute] eval 错误:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "服务内部错误" });
    } else {
      res.write("data: " + JSON.stringify({ type: "error", message: err.message }) + "\n\n");
      res.end();
    }
  }
}

async function handleListEvalRuns(req, res) {
  await withUser(req, res, async (userId) => {
    const handId = parseInt(req.query.hand_id, 10);
    if (!handId) return res.status(400).json({ error: "缺少 hand_id" });
    const runs = await dao.listEvalRunsByHand(handId, userId);
    res.json({ runs });
  });
}

async function handleGetEvalRun(req, res) {
  await withUser(req, res, async (userId) => {
    const runId = parseInt(req.params.id, 10);
    if (!runId) return res.status(400).json({ error: "无效 run ID" });
    const run = await dao.getEvalRun(runId, userId);
    if (!run) return res.status(404).json({ error: "评估批次不存在" });
    res.json(run);
  });
}

// ===== 路由组装 =====

const pokerRouter = express.Router();

pokerRouter.post("/completions", handleCompletions);
pokerRouter.post("/hands", handleCreateHand);
pokerRouter.get("/hands", handleListHands);
pokerRouter.get("/hands/:id", handleGetHand);
pokerRouter.delete("/hands/:id", handleDeleteHand);
pokerRouter.get("/leaks", handleGetLeaks);
pokerRouter.post("/eval/runs", handleEvalRun);
pokerRouter.get("/eval/runs", handleListEvalRuns);
pokerRouter.get("/eval/runs/:id", handleGetEvalRun);

module.exports = { pokerRouter };
