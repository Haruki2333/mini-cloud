// ===== 模型配置 =====

var MODEL_CONFIG = {
  "qwen3.5-plus": {
    label: "千问 Qwen 3.5 Plus",
    provider: "qwen",
  },
  "glm-4-plus": {
    label: "智谱 GLM-4 Plus",
    provider: "zhipu",
  },
};

var DEFAULT_MODEL = "qwen3.5-plus";

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
