// ===== 模型配置 =====

var MODEL_CONFIG = {
  "gpt-5.4":                         { label: "OpenAI GPT-5.4",             provider: "lingyaai"  },
  "qwen3.5-plus":                    { label: "千问 Qwen 3.5 Plus",          provider: "qwen"      },
  "glm-4.6v":                        { label: "智谱 GLM-4.6V",               provider: "zhipu"     },
  "claude-sonnet-4-5":               { label: "Claude Sonnet 4.5",          provider: "anthropic" },
  "gpt-4o":                          { label: "OpenAI GPT-4o",              provider: "openai"    },
  "gemini-2.5-pro":                  { label: "Gemini 2.5 Pro",             provider: "google"    },
  "deepseek-chat":                   { label: "DeepSeek V3",                provider: "deepseek"  },
  "claude-sonnet-4-6-thinking":      { label: "Claude Sonnet 4.6 Thinking", provider: "anthropic" },
  "gemini-3.1-pro-preview-thinking": { label: "Gemini 3.1 Pro Thinking",    provider: "google"    },
  "deepseek-v4-pro":                 { label: "DeepSeek V4 Pro",            provider: "deepseek"  },
  "doubao-seed-2-0-pro":             { label: "Doubao Seed 2.0 Pro",        provider: "lingyaai"  },
  "kimi-k2.6":                       { label: "Kimi K2.6",                  provider: "lingyaai"  },
};

// 评估用模型清单（compare.html 使用，须与后端 evaluator.js EVAL_MODELS 保持一致）
var EVAL_MODEL_IDS = [
  "claude-sonnet-4-6-thinking", "gpt-5.4", "gemini-3.1-pro-preview-thinking",
  "deepseek-v4-pro", "doubao-seed-2-0-pro", "kimi-k2.6",
];

var DEFAULT_MODEL = "gpt-5.4";

// ===== 位置列表 =====

var POSITIONS_6MAX = ["UTG", "UTG+1", "CO", "BTN", "SB", "BB"];
var POSITIONS_9MAX = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
var POSITIONS_HU = ["BTN/SB", "BB"];

function getPositions(tableType) {
  if (tableType === "9max") return POSITIONS_9MAX;
  if (tableType === "hu") return POSITIONS_HU;
  return POSITIONS_6MAX;
}

// ===== 评级文本 =====

var RATING_LABELS = {
  good: "好",
  acceptable: "可接受",
  problematic: "有问题",
};

var STREET_LABELS = {
  preflop: "翻前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
};

// ===== 牌面颜色 =====

function getCardColor(cardStr) {
  if (!cardStr) return "black";
  var lower = cardStr.toLowerCase();
  if (lower.includes("h") || lower.includes("d")) return "red";
  return "black";
}

function parseCards(boardStr) {
  if (!boardStr) return [];
  return boardStr.trim().split(/\s+/).filter(Boolean);
}

function renderCardChips(boardStr) {
  var cards = parseCards(boardStr);
  return cards.map(function (c) {
    var color = getCardColor(c);
    return '<span class="card-chip ' + color + '">' + c + "</span>";
  }).join("");
}

// ===== 结果格式化 =====

function formatResultBB(bb) {
  if (bb === null || bb === undefined || bb === "") return null;
  var n = parseFloat(bb);
  if (isNaN(n)) return null;
  var sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(1) + " BB";
}

function getResultClass(bb) {
  if (bb === null || bb === undefined || bb === "") return "neutral";
  var n = parseFloat(bb);
  if (isNaN(n)) return "neutral";
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "neutral";
}

// ===== 日期格式化 =====

function formatDate(dateStr) {
  if (!dateStr) return "";
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return (d.getMonth() + 1) + "/" + d.getDate();
}

// ===== Toast =====

function showToast(msg) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(function () { el.classList.remove("show"); }, 2500);
}

// ===== Postflop 行动顺序（从 SB 开始顺时针）=====

var POSTFLOP_ORDER_9MAX = ["SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"];
var POSTFLOP_ORDER_6MAX = ["SB", "BB", "UTG", "UTG+1", "CO", "BTN"];
var POSTFLOP_ORDER_HU   = ["BTN/SB", "BB"];

function getPostflopOrder(tableType) {
  if (tableType === "9max") return POSTFLOP_ORDER_9MAX;
  if (tableType === "hu") return POSTFLOP_ORDER_HU;
  return POSTFLOP_ORDER_6MAX;
}

// ===== 行动类型 =====

var PREFLOP_ACTIONS  = ["fold", "call", "raise", "3bet", "4bet", "all-in"];
var POSTFLOP_ACTIONS = ["check", "bet", "call", "raise", "fold", "all-in"];

// 需要填金额的行动
function actionNeedsAmount(action) {
  return ["raise", "bet", "3bet", "4bet", "all-in"].indexOf(action) !== -1;
}

// 是否为 aggressive 行动（触发智能追加）
function isAggressiveAction(action) {
  return ["raise", "3bet", "4bet", "bet", "all-in"].indexOf(action) !== -1;
}
