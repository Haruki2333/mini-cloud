/**
 * 扑克教练 — 数据库操作层
 */

const models = require("./models");

// ===== 用户 =====

async function findOrCreateUser(anonToken) {
  const [user] = await models.PokerUser.findOrCreate({
    where: { anon_token: anonToken },
    defaults: { anon_token: anonToken },
  });
  return user.id;
}

// ===== 手牌 =====

async function createHand(userId, data) {
  const hand = await models.PokerHand.create({
    user_id: userId,
    blind_level: data.blind_level,
    table_type: data.table_type || "6max",
    hero_position: data.hero_position,
    hero_cards: data.hero_cards,
    effective_stack_bb: data.effective_stack_bb || null,
    opponent_notes: data.opponent_notes || null,
    preflop_actions: data.preflop_actions,
    flop_cards: data.flop_cards || null,
    flop_actions: data.flop_actions || null,
    turn_card: data.turn_card || null,
    turn_actions: data.turn_actions || null,
    river_card: data.river_card || null,
    river_actions: data.river_actions || null,
    result_bb: data.result_bb !== undefined ? data.result_bb : null,
    showdown_opp_cards: data.showdown_opp_cards || null,
    notes: data.notes || null,
    played_at: data.played_at || null,
    opponents: data.opponents || null,
    actions: data.actions || null,
    is_analyzed: false,
  });
  return hand.id;
}

async function listHands(userId, limit = 50) {
  const hands = await models.PokerHand.findAll({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
    limit,
    attributes: [
      "id", "blind_level", "table_type", "hero_position",
      "hero_cards", "result_bb", "played_at", "is_analyzed", "created_at",
    ],
  });
  return hands.map((h) => h.toJSON());
}

async function countHands(userId) {
  return models.PokerHand.count({ where: { user_id: userId } });
}

async function countAnalyzedHands(userId) {
  return models.PokerHand.count({ where: { user_id: userId, is_analyzed: true } });
}

async function handBelongsToUser(handId, userId) {
  const count = await models.PokerHand.count({ where: { id: handId, user_id: userId } });
  return count > 0;
}

async function getHandWithAnalyses(handId, userId) {
  const hand = await models.PokerHand.findOne({
    where: { id: handId, user_id: userId },
  });
  if (!hand) return null;

  const analyses = await models.PokerAnalysis.findAll({
    where: { hand_id: handId },
    order: [["id", "ASC"]],
  });

  return { ...hand.toJSON(), analyses: analyses.map((a) => a.toJSON()) };
}

// ===== 分析 =====

async function saveAnalyses(handId, analysesData) {
  const created = await models.PokerAnalysis.bulkCreate(
    analysesData.map((a) => ({
      hand_id: handId,
      street: a.street,
      scenario: a.scenario,
      rating: a.rating,
      hero_action: a.hero_action,
      better_action: a.better_action || null,
      reasoning: a.reasoning,
      principle: a.principle,
    }))
  );

  await models.PokerHand.update(
    { is_analyzed: true },
    { where: { id: handId } }
  );

  return created.map((a) => a.toJSON());
}

async function getUserAnalyses(userId, limit = 100) {
  const hands = await models.PokerHand.findAll({
    where: { user_id: userId, is_analyzed: true },
    attributes: ["id", "hero_position", "blind_level", "table_type", "played_at"],
    order: [["created_at", "DESC"]],
    limit,
  });

  if (hands.length === 0) return [];

  const handIds = hands.map((h) => h.id);
  const handMap = Object.fromEntries(hands.map((h) => [h.id, h.toJSON()]));

  const analyses = await models.PokerAnalysis.findAll({
    where: { hand_id: handIds },
    order: [["hand_id", "ASC"], ["id", "ASC"]],
  });

  return analyses.map((a) => ({
    ...a.toJSON(),
    hero_position: handMap[a.hand_id]?.hero_position,
    blind_level: handMap[a.hand_id]?.blind_level,
    table_type: handMap[a.hand_id]?.table_type,
    played_at: handMap[a.hand_id]?.played_at,
  }));
}

// ===== Leak =====

async function saveLeaks(userId, leaksData) {
  await models.PokerLeak.destroy({ where: { user_id: userId } });

  if (!leaksData || leaksData.length === 0) return [];

  const created = await models.PokerLeak.bulkCreate(
    leaksData.map((l) => ({
      user_id: userId,
      pattern: l.pattern,
      occurrences: l.occurrences || 1,
      example_hand_ids: l.example_hand_ids || null,
    }))
  );
  return created.map((l) => l.toJSON());
}

async function getLeaks(userId) {
  const leaks = await models.PokerLeak.findAll({
    where: { user_id: userId },
    order: [["occurrences", "DESC"]],
  });
  return leaks.map((l) => l.toJSON());
}

// ===== 评估批次 =====

async function createEvalRun(userId, handId, requestedModels) {
  const run = await models.PokerEvalRun.create({
    user_id: userId,
    hand_id: handId,
    requested_models: requestedModels,
    status: "running",
  });
  return run.id;
}

async function saveEvalResult(evalRunId, handId, data) {
  const result = await models.PokerEvalResult.create({
    eval_run_id: evalRunId,
    hand_id: handId,
    model_id: data.model_id,
    provider: data.provider,
    status: data.status,
    latency_ms: data.latency_ms || null,
    prompt_tokens: data.prompt_tokens || null,
    completion_tokens: data.completion_tokens || null,
    cached_tokens: data.cached_tokens || null,
    cost_usd: data.cost_usd || 0,
    structured_output: data.structured_output || null,
    raw_response: data.raw_response || null,
    error_message: data.error_message || null,
    schema_valid: data.schema_valid != null ? data.schema_valid : null,
  });
  return result.id;
}

async function computeConsistency(evalRunId, hand) {
  const results = await models.PokerEvalResult.findAll({
    where: { eval_run_id: evalRunId, status: "success", schema_valid: true },
  });
  if (results.length === 0) return 0;

  const streets = ["preflop"];
  if (hand.flop_cards) streets.push("flop");
  if (hand.turn_card) streets.push("turn");
  if (hand.river_card) streets.push("river");

  const streetScores = [];
  for (const street of streets) {
    const ratings = results
      .map((r) => {
        const arr = r.structured_output;
        if (!Array.isArray(arr)) return null;
        const item = arr.find((a) => a.street === street);
        return item ? item.rating : null;
      })
      .filter(Boolean);
    if (ratings.length === 0) continue;
    const counts = {};
    for (const r of ratings) counts[r] = (counts[r] || 0) + 1;
    const modeCount = Math.max(...Object.values(counts));
    streetScores.push(modeCount / ratings.length);
  }

  if (streetScores.length === 0) return 0;
  const avg = streetScores.reduce((a, b) => a + b, 0) / streetScores.length;
  return Number((avg * 100).toFixed(1));
}

async function finalizeEvalRun(evalRunId, updates) {
  const fields = {};
  if (updates.status != null) fields.status = updates.status;
  if (updates.totalCostUsd != null) fields.total_cost_usd = updates.totalCostUsd;
  if (updates.consistencyScore != null) fields.consistency_score = updates.consistencyScore;
  if (updates.judgeModelId != null) fields.judge_model_id = updates.judgeModelId;
  await models.PokerEvalRun.update(fields, { where: { id: evalRunId } });
}

async function listEvalRunsByHand(handId, userId) {
  const runs = await models.PokerEvalRun.findAll({
    where: { hand_id: handId, user_id: userId },
    order: [["created_at", "DESC"]],
  });
  return runs.map((r) => r.toJSON());
}

async function getEvalRun(evalRunId, userId) {
  const run = await models.PokerEvalRun.findOne({
    where: { id: evalRunId, user_id: userId },
  });
  if (!run) return null;
  const results = await models.PokerEvalResult.findAll({
    where: { eval_run_id: evalRunId },
    order: [["id", "ASC"]],
  });
  return { ...run.toJSON(), results: results.map((r) => r.toJSON()) };
}

async function saveJudgeScores(evalRunId, scores) {
  for (const s of scores) {
    await models.PokerEvalResult.update(
      { judge_score: s.score, judge_notes: s.notes || null },
      { where: { eval_run_id: evalRunId, model_id: s.model_id } }
    );
  }
}

module.exports = {
  findOrCreateUser,
  createHand,
  listHands,
  countHands,
  handBelongsToUser,
  countAnalyzedHands,
  getHandWithAnalyses,
  saveAnalyses,
  getUserAnalyses,
  saveLeaks,
  getLeaks,
  // 评估
  createEvalRun,
  saveEvalResult,
  computeConsistency,
  finalizeEvalRun,
  listEvalRunsByHand,
  getEvalRun,
  saveJudgeScores,
};
