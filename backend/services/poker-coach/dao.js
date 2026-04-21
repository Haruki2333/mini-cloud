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

async function getHand(handId, userId) {
  const hand = await models.PokerHand.findOne({
    where: { id: handId, user_id: userId },
  });
  return hand ? hand.toJSON() : null;
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

module.exports = {
  findOrCreateUser,
  createHand,
  listHands,
  countHands,
  getHand,
  getHandWithAnalyses,
  saveAnalyses,
  getUserAnalyses,
  saveLeaks,
  getLeaks,
};
