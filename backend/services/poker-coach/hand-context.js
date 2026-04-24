/**
 * 手牌文本化 — 纯函数，将数据库 hand 对象转为评估 prompt 所需的文本。
 * 逻辑与前端 analysis.js 的 buildHandContext 保持一致。
 */

function buildHandContext(hand) {
  const lines = [];
  lines.push(`手牌 #${hand.id}`);
  lines.push(`盲注: ${hand.blind_level}`);
  lines.push(`桌型: ${hand.table_type || "6max"}`);
  lines.push(`位置: ${hand.hero_position}`);
  lines.push(`起手牌: ${hand.hero_cards}`);
  if (hand.effective_stack_bb != null) {
    lines.push(`有效筹码: ${hand.effective_stack_bb}BB`);
  }
  if (hand.result_bb != null) {
    const sign = Number(hand.result_bb) >= 0 ? "+" : "";
    lines.push(`结果: ${sign}${Number(hand.result_bb).toFixed(1)}BB`);
  }
  if (hand.opponent_notes) lines.push(`对手: ${hand.opponent_notes}`);

  if (hand.preflop_actions) lines.push(`\n翻前行动: ${hand.preflop_actions}`);
  if (hand.flop_cards) {
    lines.push(`\n翻牌: ${hand.flop_cards}`);
    if (hand.flop_actions) lines.push(`翻牌行动: ${hand.flop_actions}`);
  }
  if (hand.turn_card) {
    lines.push(`\n转牌: ${hand.turn_card}`);
    if (hand.turn_actions) lines.push(`转牌行动: ${hand.turn_actions}`);
  }
  if (hand.river_card) {
    lines.push(`\n河牌: ${hand.river_card}`);
    if (hand.river_actions) lines.push(`河牌行动: ${hand.river_actions}`);
  }

  return lines.join("\n");
}

module.exports = { buildHandContext };
