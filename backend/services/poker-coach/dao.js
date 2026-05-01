/**
 * 扑克教练 — 数据库操作层
 */

const models = require("./models");

// ===== 内部工具 =====

// TODO: serializeActions 是行动数组的文本序列化逻辑，属于数据展示层关切，
//       应迁移至 hand-context.js 与其他手牌文本化函数统一维护
function serializeActions(actionsArr) {
  if (!actionsArr || actionsArr.length === 0) return null;
  return actionsArr.map((a) => {
    let text = a.position + " " + a.action;
    if (a.amount != null) text += " " + a.amount;
    return text;
  }).join("，");
}

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
  const fields = { ...data };

  // 从 actions JSON 自动生成文本版本回填旧字段（向后兼容）
  if (fields.actions && !fields.preflop_actions) {
    fields.preflop_actions = serializeActions(fields.actions.preflop);
    fields.flop_actions = serializeActions(fields.actions.flop) || fields.flop_actions;
    fields.turn_actions = serializeActions(fields.actions.turn) || fields.turn_actions;
    fields.river_actions = serializeActions(fields.actions.river) || fields.river_actions;
  }

  // 从 opponents JSON 自动生成 opponent_notes 文本（向后兼容）
  if (fields.opponents && !fields.opponent_notes) {
    fields.opponent_notes = fields.opponents
      .map((o) => o.position + (o.stack_bb ? " (" + o.stack_bb + "BB)" : ""))
      .join("，");
  }

  const hand = await models.PokerHand.create({
    user_id: userId,
    blind_level: fields.blind_level,
    table_type: fields.table_type || "6max",
    hero_position: fields.hero_position,
    hero_cards: fields.hero_cards,
    effective_stack_bb: fields.effective_stack_bb || null,
    opponent_notes: fields.opponent_notes || null,
    preflop_actions: fields.preflop_actions,
    flop_cards: fields.flop_cards || null,
    flop_actions: fields.flop_actions || null,
    turn_card: fields.turn_card || null,
    turn_actions: fields.turn_actions || null,
    river_card: fields.river_card || null,
    river_actions: fields.river_actions || null,
    result_bb: fields.result_bb !== undefined ? fields.result_bb : null,
    showdown_opp_cards: fields.showdown_opp_cards || null,
    notes: fields.notes || null,
    played_at: fields.played_at || null,
    opponents: fields.opponents || null,
    actions: fields.actions || null,
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
      "analysis_model_id", "analysis_prompt_tokens",
      "analysis_completion_tokens", "analysis_cost_usd",
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

async function deleteHand(handId, userId) {
  const count = await models.PokerHand.count({ where: { id: handId, user_id: userId } });
  if (count === 0) return false;

  // 按外键依赖顺序删除：eval_results → eval_runs → analyses → hand
  await models.PokerHand.sequelize.transaction(async (t) => {
    const runs = await models.PokerEvalRun.findAll({
      where: { hand_id: handId },
      attributes: ["id"],
      transaction: t,
    });
    if (runs.length > 0) {
      const runIds = runs.map((r) => r.id);
      await models.PokerEvalResult.destroy({ where: { eval_run_id: runIds }, transaction: t });
      await models.PokerEvalRun.destroy({ where: { id: runIds }, transaction: t });
    }
    await models.PokerAnalysis.destroy({ where: { hand_id: handId }, transaction: t });
    await models.PokerHand.destroy({ where: { id: handId, user_id: userId }, transaction: t });
  });
  return true;
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
  await models.PokerAnalysis.destroy({ where: { hand_id: handId } });

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

async function updateHandAnalysisMeta(handId, meta) {
  await models.PokerHand.update(
    {
      analysis_model_id: meta.analysis_model_id,
      analysis_prompt_tokens: meta.analysis_prompt_tokens,
      analysis_completion_tokens: meta.analysis_completion_tokens,
      analysis_cost_usd: meta.analysis_cost_usd,
    },
    { where: { id: handId } }
  );
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

async function getValidEvalResultOutputs(evalRunId) {
  const results = await models.PokerEvalResult.findAll({
    where: { eval_run_id: evalRunId, status: "success", schema_valid: true },
    attributes: ["structured_output"],
  });
  return results.map((r) => r.structured_output);
}

async function finalizeEvalRun(evalRunId, updates) {
  const fields = {};
  if (updates.status != null) fields.status = updates.status;
  if (updates.totalCostUsd != null) fields.total_cost_usd = updates.totalCostUsd;
  if (updates.consistencyScore != null) fields.consistency_score = updates.consistencyScore;
  if (updates.judgeModelId != null) fields.judge_model_id = updates.judgeModelId;
  if (Object.keys(fields).length === 0) return;
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
  await Promise.all(
    scores.map((s) =>
      models.PokerEvalResult.update(
        { judge_score: s.score, judge_notes: s.notes || null },
        { where: { eval_run_id: evalRunId, model_id: s.model_id } }
      )
    )
  );
}

module.exports = {
  findOrCreateUser,
  createHand,
  listHands,
  countHands,
  handBelongsToUser,
  deleteHand,
  countAnalyzedHands,
  getHandWithAnalyses,
  saveAnalyses,
  updateHandAnalysisMeta,
  getUserAnalyses,
  saveLeaks,
  getLeaks,
  // 评估
  createEvalRun,
  saveEvalResult,
  getValidEvalResultOutputs,
  finalizeEvalRun,
  listEvalRunsByHand,
  getEvalRun,
  saveJudgeScores,
};
