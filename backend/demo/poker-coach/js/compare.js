// ===== 初始化 =====

var HAND_ID = parseInt(new URLSearchParams(location.search).get("hand_id"), 10) || null;
var currentModels = []; // 当前评估中的模型列表
var currentEvalResults = []; // 实时评估收集的 result（用于 KPI 最快/最省计算）

function getLingyaaiKey() {
  var s = getSettings();
  return (s.apiKeys && s.apiKeys.lingyaai) || null;
}

function buildEvalHeaders() {
  var headers = { "Content-Type": "application/json", "X-Anon-Token": getOrCreateAnonToken() };
  var key = getLingyaaiKey();
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

function init() {
  if (!HAND_ID) { showToast("缺少 hand_id 参数"); return; }
  document.getElementById("backBtn").href = "/poker/analysis.html?hand_id=" + HAND_ID;
  renderModelCheckboxes();
  loadHistory();
}

// ===== 模型复选框 =====

function renderModelCheckboxes() {
  var container = document.getElementById("modelCheckboxes");
  container.innerHTML = EVAL_MODEL_IDS.map(function (id) {
    var cfg = MODEL_CONFIG[id] || { label: id };
    return (
      '<div class="model-checkbox-row">' +
        '<input type="checkbox" id="cb_' + id + '" value="' + id + '" checked />' +
        '<label for="cb_' + id + '">' + cfg.label + "</label>" +
      "</div>"
    );
  }).join("");
}

function toggleAllModels() {
  var checkboxes = document.querySelectorAll("#modelCheckboxes input[type=checkbox]");
  var allChecked = Array.prototype.every.call(checkboxes, function (cb) { return cb.checked; });
  checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
}

function getSelectedModelIds() {
  return Array.prototype.map.call(
    document.querySelectorAll("#modelCheckboxes input[type=checkbox]:checked"),
    function (cb) { return cb.value; }
  );
}

// ===== 历史批次 =====

async function loadHistory() {
  try {
    var resp = await fetch("/api/poker/eval/runs?hand_id=" + HAND_ID, { headers: buildEvalHeaders() });
    if (!resp.ok) return;
    var data = await resp.json();
    var select = document.getElementById("historySelect");
    (data.runs || []).forEach(function (run) {
      var opt = document.createElement("option");
      opt.value = run.id;
      var d = new Date(run.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      var modelCount = Array.isArray(run.requested_models) ? run.requested_models.length : "?";
      opt.textContent = d + "  " + modelCount + "模型  " + run.status;
      select.appendChild(opt);
    });
    select.addEventListener("change", function () {
      if (select.value) {
        document.getElementById("newEvalCard").style.display = "none";
        document.getElementById("startBtn").style.display = "none";
        loadHistoryRun(parseInt(select.value, 10));
      } else {
        document.getElementById("newEvalCard").style.display = "";
        document.getElementById("startBtn").style.display = "";
        document.getElementById("tableArea").style.display = "none";
        document.getElementById("kpiGrid").style.display = "none";
      }
    });
  } catch (_) {}
}

async function loadHistoryRun(runId) {
  try {
    var resp = await fetch("/api/poker/eval/runs/" + runId, { headers: buildEvalHeaders() });
    if (!resp.ok) { showToast("加载失败"); return; }
    var run = await resp.json();
    var models = (run.requested_models || []).map(function (id) {
      return { id: id, label: MODEL_CONFIG[id] ? MODEL_CONFIG[id].label : id };
    });
    currentModels = models;
    initTable(models);
    (run.results || []).forEach(function (r) { fillModelColumn(r.model_id, r); });
    renderKPI({
      consistency_score: run.consistency_score,
      total_cost_usd: run.total_cost_usd,
    }, run.results || []);
  } catch (_) { showToast("加载失败"); }
}

// ===== 开始评估 =====

async function startEval() {
  if (!HAND_ID) return;
  var apiKey = getLingyaaiKey();
  if (!apiKey) { showToast("请先在设置页配置 lingyaai API Key"); return; }

  var modelIds = getSelectedModelIds();
  if (modelIds.length === 0) { showToast("请至少选择一个模型"); return; }

  var btn = document.getElementById("startBtn");
  btn.disabled = true;
  btn.textContent = "评估中…";

  currentModels = modelIds.map(function (id) {
    return { id: id, label: MODEL_CONFIG[id] ? MODEL_CONFIG[id].label : id };
  });
  currentEvalResults = [];
  initTable(currentModels);

  try {
    var resp = await fetch("/api/poker/eval/runs", {
      method: "POST",
      headers: buildEvalHeaders(),
      body: JSON.stringify({ hand_id: HAND_ID, model_ids: modelIds }),
    });
    if (!resp.ok) { showToast("评估启动失败"); return; }

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    var sseEnded = false;
    while (!sseEnded) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith("data: ")) continue;
        var raw = line.slice(6).trim();
        if (raw === "[DONE]") { sseEnded = true; break; }
        try { handleEvalEvent(JSON.parse(raw)); } catch (_) {}
      }
    }
  } catch (e) {
    showToast("评估失败: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "开始评估";
  }

  // 刷新历史下拉
  var select = document.getElementById("historySelect");
  while (select.options.length > 1) select.remove(1);
  loadHistory();
}

// ===== SSE 事件处理 =====

function handleEvalEvent(evt) {
  if (evt.type === "eval_started") {
    showToast("评估开始");
  } else if (evt.type === "eval_model_done") {
    currentEvalResults.push(evt.result);
    fillModelColumn(evt.model_id, evt.result);
  } else if (evt.type === "eval_judge_done") {
    fillJudgeRow(evt.scores);
  } else if (evt.type === "eval_completed") {
    renderKPI(evt, currentEvalResults);
    showToast("评估完成");
  } else if (evt.type === "error") {
    showToast("错误: " + evt.message);
  }
}

// ===== 表格渲染 =====

var STREETS = [
  { key: "preflop", label: "翻前" },
  { key: "flop",    label: "翻牌" },
  { key: "turn",    label: "转牌" },
  { key: "river",   label: "河牌" },
];

var SUMMARY_ROWS = [
  { key: "latency",    label: "延迟(ms)" },
  { key: "tokens",     label: "Tokens" },
  { key: "cost",       label: "费用($)" },
  { key: "schema",     label: "合规" },
  { key: "judge",      label: "裁判★" },
];

function initTable(models) {
  var area = document.getElementById("tableArea");
  area.style.display = "block";
  var table = document.getElementById("evalTable");
  table.innerHTML = "";

  // 表头
  var thead = table.createTHead();
  var hRow = thead.insertRow();
  addTh(hRow, "街");
  models.forEach(function (m) { addTh(hRow, m.label); });

  // 街行
  var tbody = table.createTBody();
  STREETS.forEach(function (s) {
    var row = tbody.insertRow();
    row.id = "row-street-" + s.key;
    var th = document.createElement("td");
    th.textContent = s.label;
    row.appendChild(th);
    models.forEach(function (m) {
      var td = row.insertCell();
      td.id = "cell-" + s.key + "-" + m.id;
      td.className = "eval-cell";
      td.innerHTML = '<span style="color:var(--ink-faint);">—</span>';
      td.onclick = function () { toggleCellDetail(td); };
    });
  });

  // 汇总行
  var tfoot = table.createTFoot();
  SUMMARY_ROWS.forEach(function (sr) {
    var row = tfoot.insertRow();
    row.id = "row-summary-" + sr.key;
    var td0 = row.insertCell();
    td0.textContent = sr.label;
    models.forEach(function (m) {
      var td = row.insertCell();
      td.id = "summary-" + sr.key + "-" + m.id;
      td.innerHTML = '<span style="color:var(--ink-faint);">…</span>';
    });
  });
}

function addTh(row, text) {
  var th = document.createElement("th");
  th.textContent = text;
  row.appendChild(th);
}

function toggleCellDetail(td) {
  var detail = td.querySelector(".cell-detail");
  if (detail) detail.style.display = detail.style.display === "none" ? "block" : "none";
}

// ===== 填充列数据 =====

var RATING_COLORS = { good: "var(--green)", acceptable: "var(--ink)", problematic: "var(--red)" };

function fillModelColumn(modelId, result) {
  if (result.status !== "success") {
    // 所有街显示错误
    STREETS.forEach(function (s) {
      var td = document.getElementById("cell-" + s.key + "-" + modelId);
      if (td) td.innerHTML = '<span style="color:var(--red);font-size:11px;">' +
        escHtml(result.status) + "</span>";
    });
    fillSummaryCell("latency", modelId, result.latency_ms ? result.latency_ms + "ms" : "—");
    fillSummaryCell("tokens", modelId, "—");
    fillSummaryCell("cost", modelId, "—");
    fillSummaryCell("schema", modelId, "✗");
    return;
  }

  var analyses = result.structured_output || [];
  analyses.forEach(function (a) {
    var td = document.getElementById("cell-" + a.street + "-" + modelId);
    if (!td) return;
    var color = RATING_COLORS[a.rating] || "var(--ink)";
    var ratingLabel = RATING_LABELS[a.rating] || a.rating;
    td.innerHTML =
      '<span class="rating-badge ' + a.rating + '">' + ratingLabel + "</span>" +
      '<div class="cell-detail">' +
        cellField("场景", a.scenario) +
        cellField("Hero操作", a.hero_action) +
        (a.better_action ? cellField("更优选择", a.better_action) : "") +
        cellField("分析", a.reasoning) +
        cellField("原则", a.principle) +
      "</div>";
  });

  var tokens = ((result.prompt_tokens || 0) + (result.completion_tokens || 0));
  fillSummaryCell("latency", modelId, result.latency_ms ? result.latency_ms + "ms" : "—");
  fillSummaryCell("tokens", modelId, tokens ? tokens.toLocaleString() : "—");
  fillSummaryCell("cost", modelId, result.cost_usd != null ? "$" + result.cost_usd.toFixed(4) : "—");
  fillSummaryCell("schema", modelId, result.schema_valid ? "✓" : "✗");
}

function cellField(label, value) {
  return '<div class="cf"><div class="cf-label">' + label + "</div>" + escHtml(value) + "</div>";
}

function fillSummaryCell(rowKey, modelId, value) {
  var td = document.getElementById("summary-" + rowKey + "-" + modelId);
  if (td) td.textContent = value;
}

// ===== 裁判评分 =====

function fillJudgeRow(scores) {
  if (!scores || !scores.length) return;
  scores.forEach(function (s) {
    fillSummaryCell("judge", s.model_id, "★" + s.score + (s.notes ? " — " + s.notes.slice(0, 20) : ""));
  });
}

// ===== KPI =====

function renderKPI(evt, results) {
  var grid = document.getElementById("kpiGrid");
  grid.style.display = "flex";

  var fastest = "—", cheapest = "—";
  if (results) {
    var successful = results.filter(function (r) { return r.status === "success"; });
    if (successful.length > 0) {
      var fModel = successful.reduce(function (a, b) { return (a.latency_ms || Infinity) < (b.latency_ms || Infinity) ? a : b; });
      fastest = (MODEL_CONFIG[fModel.model_id] || { label: fModel.model_id }).label + " (" + fModel.latency_ms + "ms)";
      var cModel = successful.reduce(function (a, b) { return (a.cost_usd || Infinity) < (b.cost_usd || Infinity) ? a : b; });
      cheapest = (MODEL_CONFIG[cModel.model_id] || { label: cModel.model_id }).label + " ($" + (cModel.cost_usd || 0).toFixed(4) + ")";
    }
  }

  grid.innerHTML =
    kpiCard(evt.consistency_score != null ? evt.consistency_score + "%" : "—", "一致率") +
    kpiCard(evt.total_cost_usd != null ? "$" + Number(evt.total_cost_usd).toFixed(4) : "—", "总成本") +
    kpiCard(fastest, "最快模型") +
    kpiCard(cheapest, "最省模型");
}

function kpiCard(value, label) {
  return '<div class="kpi-card"><div class="kpi-value">' + escHtml(String(value)) + '</div><div class="kpi-label">' + label + "</div></div>";
}

// ===== 工具 =====

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ===== 启动 =====
init();
