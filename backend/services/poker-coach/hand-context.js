/**
 * 手牌文本化 — 纯函数，将数据库 hand 对象转为评估 prompt 所需的文本。
 * 逻辑与前端 analysis.js 的 buildHandContext 保持一致。
 */

function serializeActions(actionsArr) {
  if (!actionsArr || actionsArr.length === 0) return null;
  return actionsArr.map((a) => {
    let text = a.position + " " + a.action;
    if (a.amount != null) text += " " + a.amount;
    return text;
  }).join("，");
}

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

const VALID_STREETS = new Set(["preflop", "flop", "turn", "river"]);
const VALID_RATINGS = new Set(["good", "acceptable", "problematic"]);

/**
 * 校验 analyses 数组，返回错误描述字符串；通过则返回 null。
 * 供 agent.js 和 evaluator.js 共用，避免重复维护同一 schema 约束。
 */
function validateAnalysisItems(analysesArr) {
  if (!Array.isArray(analysesArr) || analysesArr.length === 0) {
    return "analyses 字段缺失或为空数组";
  }
  for (let i = 0; i < analysesArr.length; i++) {
    const a = analysesArr[i];
    if (!a || typeof a !== "object") return `analyses[${i}] 不是对象`;
    if (!VALID_STREETS.has(a.street)) return `analyses[${i}].street 非法（${a.street}）`;
    if (!VALID_RATINGS.has(a.rating)) return `analyses[${i}].rating 非法（${a.rating}）`;
    if (!a.scenario || !a.hero_action || !a.reasoning || !a.principle) {
      return `analyses[${i}] 缺少必填文本字段`;
    }
  }
  return null;
}

/**
 * 剥除模型可能附加的 markdown 代码块包裹（```json ... ``` 或 ``` ... ```）。
 * agent.js 与 evaluator.js 共用，避免各自维护相似的正则。
 */
function stripJsonWrapper(content) {
  if (!content) return content;
  return content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

module.exports = { serializeActions, buildHandContext, validateAnalysisItems, stripJsonWrapper };
