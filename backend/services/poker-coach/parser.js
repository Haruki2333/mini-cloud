/**
 * 扑克教练 — 自然语言录入解析器
 *
 * 将用户的一段自由文本（"1/2 九人桌 BTN AhKd 100bb，UTG 加到 3bb…"）
 * 解析为 poker_hands schema 的部分填充对象，并标注缺失字段 / 解析警告。
 *
 * 失败重试 1 次：第二次会把上次的非 JSON 输出与错误一起回喂给 LLM。
 * 关键字段全空 → throw parse_failed，路由层返回 422，前端降级到 form.html。
 */

const { chat } = require("../core/llm");
const { PARSER_SYSTEM_PROMPT } = require("./prompts");

// 模型选型：当前 LLM 注册表中无显式"小模型"，暂用主对话默认模型。
// 后续如在 core/llm.js 添加小模型（如 gpt-4.1-mini / haiku 4.5）时替换此常量即可。
const PARSER_MODEL = "gpt-5.4";

const MAX_RETRY = 1;

// ===== 枚举与正则 =====

const TABLE_TYPES = ["6max", "9max", "hu"];
const POSITIONS = ["UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB", "BTN/SB"];
const PREFLOP_ACTIONS = ["fold", "call", "raise", "3bet", "4bet", "all-in"];
const POSTFLOP_ACTIONS = ["check", "bet", "call", "raise", "fold", "all-in"];
const AMOUNT_ACTIONS = ["raise", "bet", "3bet", "4bet", "all-in"];

const CARD_ONE = /^[2-9TJQKA][shdc]$/;
const CARDS_TWO = /^[2-9TJQKA][shdc][2-9TJQKA][shdc]$/;
const CARDS_THREE = /^[2-9TJQKA][shdc][2-9TJQKA][shdc][2-9TJQKA][shdc]$/;
const BLIND_RE = /^[\d.]+\/[\d.]+$/;

// ===== 工具函数 =====

function tryParseJson(rawContent) {
  if (!rawContent) return null;
  const cleaned = rawContent
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function nullable(v) {
  // 把空串、空对象等归一为 null（数字 0 / 负数保留）
  if (v === undefined || v === "" || v === null) return null;
  return v;
}

// ===== Schema 校验与归一化 =====

/**
 * 校验并归一化 LLM 输出。
 * - 非法值清空并加入 warnings（不抛错）
 * - 关键字段全空 → 返回 {fatal: true}
 * @returns {{hand, missing[], warnings[], fatal?: boolean}}
 */
function validateAndNormalize(parsed) {
  const warnings = [];
  const missing = [];

  if (!isPlainObject(parsed)) {
    return { fatal: true, reason: "顶层不是对象" };
  }

  // LLM 自己声明的 missing/warnings 也合进来
  if (Array.isArray(parsed.missing)) missing.push(...parsed.missing.filter((x) => typeof x === "string"));
  if (Array.isArray(parsed.warnings)) warnings.push(...parsed.warnings.filter((x) => typeof x === "string"));

  const hand = {};

  // blind_level: 形如 "1/2"
  if (typeof parsed.blind_level === "string" && BLIND_RE.test(parsed.blind_level.trim())) {
    hand.blind_level = parsed.blind_level.trim();
  } else {
    hand.blind_level = null;
    if (parsed.blind_level) warnings.push(`blind_level 格式非法："${parsed.blind_level}"`);
  }

  // table_type
  if (TABLE_TYPES.indexOf(parsed.table_type) !== -1) {
    hand.table_type = parsed.table_type;
  } else {
    hand.table_type = null;
    if (parsed.table_type) warnings.push(`table_type 非法值："${parsed.table_type}"`);
  }

  // hero_position
  if (typeof parsed.hero_position === "string" && POSITIONS.indexOf(parsed.hero_position) !== -1) {
    hand.hero_position = parsed.hero_position;
  } else {
    hand.hero_position = null;
    if (parsed.hero_position) warnings.push(`hero_position 非法值："${parsed.hero_position}"`);
  }

  // hero_cards
  if (typeof parsed.hero_cards === "string" && CARDS_TWO.test(parsed.hero_cards.replace(/\s/g, ""))) {
    hand.hero_cards = parsed.hero_cards.replace(/\s/g, "");
  } else {
    hand.hero_cards = null;
    if (parsed.hero_cards) warnings.push(`hero_cards 格式非法："${parsed.hero_cards}"`);
  }

  // effective_stack_bb
  hand.effective_stack_bb = sanitizeNumber(parsed.effective_stack_bb);

  // opponents
  hand.opponents = [];
  if (Array.isArray(parsed.opponents)) {
    parsed.opponents.forEach((o, i) => {
      if (!isPlainObject(o)) return;
      const pos = POSITIONS.indexOf(o.position) !== -1 ? o.position : null;
      if (!pos) {
        if (o.position) warnings.push(`opponents[${i}].position 非法："${o.position}"`);
        return;
      }
      hand.opponents.push({
        position: pos,
        stack_bb: sanitizeNumber(o.stack_bb),
      });
    });
  }

  // actions
  hand.actions = { preflop: [], flop: [], turn: [], river: [] };
  if (isPlainObject(parsed.actions)) {
    ["preflop", "flop", "turn", "river"].forEach((street) => {
      const arr = parsed.actions[street];
      if (!Array.isArray(arr)) return;
      const allowed = street === "preflop" ? PREFLOP_ACTIONS : POSTFLOP_ACTIONS;
      arr.forEach((a, i) => {
        if (!isPlainObject(a)) return;
        // position 允许 "Hero" 字面量
        const pos = a.position === "Hero" || POSITIONS.indexOf(a.position) !== -1 ? a.position : null;
        if (!pos) {
          if (a.position) warnings.push(`actions.${street}[${i}].position 非法："${a.position}"`);
          return;
        }
        const action = allowed.indexOf(a.action) !== -1 ? a.action : null;
        if (!action) {
          if (a.action) warnings.push(`actions.${street}[${i}].action 非法："${a.action}"`);
          return;
        }
        const amount = sanitizeNumber(a.amount);
        if (AMOUNT_ACTIONS.indexOf(action) !== -1 && amount == null) {
          // 金额缺失也保留 action，让前端引导用户补
          missing.push(`actions.${street}[${i}].amount`);
        }
        hand.actions[street].push({ position: pos, action, amount });
      });
    });
  }

  // 各街文本
  hand.preflop_actions = typeof parsed.preflop_actions === "string" ? parsed.preflop_actions : null;
  hand.flop_actions    = typeof parsed.flop_actions === "string"    ? parsed.flop_actions    : null;
  hand.turn_actions    = typeof parsed.turn_actions === "string"    ? parsed.turn_actions    : null;
  hand.river_actions   = typeof parsed.river_actions === "string"   ? parsed.river_actions   : null;

  // 公共牌
  hand.flop_cards = sanitizeCardsStr(parsed.flop_cards, "flop", warnings, 3);
  hand.turn_card  = sanitizeCardsStr(parsed.turn_card, "turn", warnings, 1);
  hand.river_card = sanitizeCardsStr(parsed.river_card, "river", warnings, 1);

  // 结果与摊牌
  hand.result_bb = sanitizeNumber(parsed.result_bb);
  hand.showdown_opp_cards = sanitizeCardsStr(parsed.showdown_opp_cards, "showdown_opp_cards", warnings, 2);

  // 文本备注
  hand.opponent_notes = typeof parsed.opponent_notes === "string" ? parsed.opponent_notes : null;
  hand.notes          = typeof parsed.notes === "string"          ? parsed.notes          : null;
  hand.played_at      = null; // 自然语言通常不带日期，由前端用今天填

  // 关键字段全空 → 致命
  const keyFieldsEmpty =
    !hand.blind_level &&
    !hand.hero_position &&
    !hand.hero_cards &&
    !hand.preflop_actions &&
    hand.actions.preflop.length === 0;
  if (keyFieldsEmpty) {
    return { fatal: true, reason: "关键字段全空" };
  }

  // 自动补 missing：关键字段为 null 但 LLM 没标的，这里补上
  const autoMissing = [];
  if (!hand.blind_level) autoMissing.push("blind_level");
  if (!hand.hero_position) autoMissing.push("hero_position");
  if (!hand.hero_cards) autoMissing.push("hero_cards");
  if (!hand.table_type) autoMissing.push("table_type");
  if (hand.effective_stack_bb == null) autoMissing.push("effective_stack_bb");
  if (hand.result_bb == null) autoMissing.push("result_bb");
  hand.opponents.forEach((o, i) => {
    if (o.stack_bb == null) autoMissing.push(`opponents[${i}].stack_bb`);
  });
  autoMissing.forEach((k) => {
    if (missing.indexOf(k) === -1) missing.push(k);
  });

  return { hand, missing, warnings, fatal: false };
}

function sanitizeNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return null;
  return n;
}

function sanitizeCardsStr(v, fieldName, warnings, expectCount) {
  if (v == null || v === "") return null;
  if (typeof v !== "string") {
    warnings.push(`${fieldName} 非字符串`);
    return null;
  }
  const norm = v.replace(/\s/g, "");
  if (expectCount === 1 && CARD_ONE.test(norm)) return norm;
  if (expectCount === 2 && CARDS_TWO.test(norm)) return norm;
  if (expectCount === 3 && CARDS_THREE.test(norm)) return norm;
  warnings.push(`${fieldName} 格式非法："${v}"`);
  return null;
}

// ===== 主入口 =====

async function parseHandText(text, apiKey) {
  if (!text || typeof text !== "string") {
    throw new Error("parse_failed:empty_input");
  }
  const trimmed = text.length > 4000 ? text.slice(0, 4000) : text;

  const messages = [
    { role: "system", content: PARSER_SYSTEM_PROMPT },
    { role: "user", content: trimmed },
  ];

  console.log(`[PokerParser] >>> 文本长度=${trimmed.length} 模型=${PARSER_MODEL}`);

  let lastRaw = "";
  let lastFatalReason = "";
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    let content, usage;
    try {
      const result = await chat(PARSER_MODEL, messages, apiKey, {
        response_format: { type: "json_object" },
      });
      content = result.content;
      usage = result.usage;
    } catch (e) {
      console.error(`[PokerParser] 第 ${attempt + 1} 次 LLM 调用失败:`, e.message);
      if (attempt === MAX_RETRY) {
        throw new Error("parse_failed:llm_error");
      }
      continue;
    }

    lastRaw = content || "";
    const parsed = tryParseJson(content);

    if (!parsed) {
      console.warn(
        `[PokerParser] 第 ${attempt + 1} 次非 JSON，原始片段=${lastRaw.slice(0, 200)}`
      );
      if (attempt < MAX_RETRY) {
        messages.push({ role: "assistant", content: lastRaw });
        messages.push({
          role: "user",
          content: "你刚才的输出不是合法 JSON。请只输出 JSON 对象，不要任何前后说明文字、不要 Markdown 代码块包裹。",
        });
      }
      continue;
    }

    const validated = validateAndNormalize(parsed);
    if (validated.fatal) {
      lastFatalReason = validated.reason;
      console.warn(`[PokerParser] 第 ${attempt + 1} 次校验失败：${validated.reason}`);
      if (attempt < MAX_RETRY) {
        messages.push({ role: "assistant", content: lastRaw });
        messages.push({
          role: "user",
          content: `你刚才的输出未通过校验：${validated.reason}。请补齐 blind_level / hero_position / hero_cards / actions.preflop 中至少能识别到的部分，重新只输出 JSON。`,
        });
      }
      continue;
    }

    console.log(
      `[PokerParser] <<< 解析成功 attempt=${attempt + 1} ` +
        `missing=${validated.missing.length} warnings=${validated.warnings.length}` +
        (usage ? ` tokens=${usage.prompt_tokens}/${usage.completion_tokens}` : "")
    );
    return validated;
  }

  throw new Error(
    "parse_failed:" + (lastFatalReason ? "schema_invalid_all_keys" : "llm_non_json")
  );
}

module.exports = { parseHandText, validateAndNormalize, PARSER_MODEL };
