# Poker Coach 大模型横向评估体系 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增多模型横向评估旁路，6 款模型并发分析同一手牌，展示 rating 一致率、token 用量、费用和裁判评分，主对话路径零改动。

**Architecture:** 后端新增 `pricing.js`、`hand-context.js`、`evaluator.js`；`models.js` + `dao.js` 扩展两张评估表；`poker.js` 新增 3 个路由。前端新增 `compare.html` + `compare.js`，`profile.html` 新增 lingyaai key 输入。评估统一走 lingyaai 代理（OpenAI Chat Completions 兼容），非流式，按完成顺序 SSE 推送。

**Tech Stack:** Node.js 18+ native fetch, Express.js, Sequelize + MySQL, Vanilla JS (ES5), SSE

---

## 文件清单

| 操作 | 文件 |
|------|------|
| 新建 | `backend/services/core/pricing.js` |
| 新建 | `backend/services/poker-coach/hand-context.js` |
| 新建 | `backend/services/poker-coach/evaluator.js` |
| 新建 | `backend/demo/poker-coach/compare.html` |
| 新建 | `backend/demo/poker-coach/js/compare.js` |
| 修改 | `backend/services/poker-coach/models.js` |
| 修改 | `backend/services/poker-coach/dao.js` |
| 修改 | `backend/routes/poker.js` |
| 修改 | `backend/demo/poker-coach/js/types.js` |
| 修改 | `backend/demo/poker-coach/profile.html` |
| 修改 | `backend/demo/poker-coach/analysis.html` |
| 修改 | `docs/api/poker.md` |
| 修改 | `docs/db/poker.md` |
| 修改 | `CLAUDE.md` |

---

## Task 1: 创建 pricing.js

**Files:**
- Create: `backend/services/core/pricing.js`

- [ ] **Step 1: 创建文件**

```js
/**
 * LLM 价格表与成本计算
 * 费率以各厂商官方价（USD/1M tokens）为占位，实际费率请对照 lingyaai 账单校准。
 */

const PRICING = {
  "claude-sonnet-4-5": { input: 3.00,  output: 15.00 },
  "gpt-4o":            { input: 2.50,  output: 10.00 },
  "gemini-2.5-pro":    { input: 1.25,  output: 10.00 },
  "deepseek-chat":     { input: 0.27,  output:  1.10 },
  "glm-4.6v":          { input: 0.29,  output:  1.14 },
  "qwen3.5-plus":      { input: 0.56,  output:  1.68 },
};

function calculateCost(modelId, usage) {
  const p = PRICING[modelId];
  if (!p || !usage) return 0;
  const input  = (usage.prompt_tokens     || 0) / 1e6 * p.input;
  const output = (usage.completion_tokens || 0) / 1e6 * p.output;
  return Number((input + output).toFixed(6));
}

module.exports = { PRICING, calculateCost };
```

- [ ] **Step 2: 验证**

```bash
cd backend && node -e "
const { calculateCost } = require('./services/core/pricing');
console.assert(calculateCost('gpt-4o', { prompt_tokens: 1000, completion_tokens: 500 }) === 0.007500, 'gpt-4o cost');
console.assert(calculateCost('unknown', {}) === 0, 'unknown model');
console.log('pricing OK');
"
```

期望输出：`pricing OK`

- [ ] **Step 3: 提交**

```bash
git add backend/services/core/pricing.js
git commit -m "feat(eval): 新增价格表 pricing.js"
```

---

## Task 2: 创建 hand-context.js

**Files:**
- Create: `backend/services/poker-coach/hand-context.js`

- [ ] **Step 1: 创建文件**

```js
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
```

- [ ] **Step 2: 验证**

```bash
cd backend && node -e "
const { buildHandContext } = require('./services/poker-coach/hand-context');
const hand = {
  id: 1, blind_level: '1/2', table_type: '6max',
  hero_position: 'BTN', hero_cards: 'AsKd',
  effective_stack_bb: 100, result_bb: -50,
  preflop_actions: 'UTG fold, BTN raise 3BB, BB call',
  flop_cards: 'Ah 7h 2c', flop_actions: 'BB check, BTN bet 5BB',
};
const ctx = buildHandContext(hand);
console.assert(ctx.includes('手牌 #1'), '包含手牌ID');
console.assert(ctx.includes('AsKd'), '包含起手牌');
console.assert(ctx.includes('翻牌: Ah 7h 2c'), '包含翻牌');
console.log('hand-context OK');
"
```

期望输出：`hand-context OK`

- [ ] **Step 3: 提交**

```bash
git add backend/services/poker-coach/hand-context.js
git commit -m "feat(eval): 新增手牌文本化模块 hand-context.js"
```

---

## Task 3: models.js — 新增两张评估表

**Files:**
- Modify: `backend/services/poker-coach/models.js`

- [ ] **Step 1: 在 `define(sequelize)` 函数中，在 `PokerLeak` 定义之后追加两个新模型**

在 `let PokerUser, PokerHand, PokerAnalysis, PokerLeak;` 这行改为：

```js
let PokerUser, PokerHand, PokerAnalysis, PokerLeak, PokerEvalRun, PokerEvalResult;
```

在 `define(sequelize)` 函数的 `PokerLeak = sequelize.define(...)` 块结束后（第 234 行 `}` 之后）、函数的最后一个 `}` 之前，追加：

```js
  PokerEvalRun = sequelize.define(
    "PokerEvalRun",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      hand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      requested_models: { type: DataTypes.JSON, allowNull: false, comment: "请求的模型 ID 数组" },
      status: {
        type: DataTypes.ENUM("running", "completed", "partial", "failed"),
        allowNull: false,
        defaultValue: "running",
      },
      total_cost_usd: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
      consistency_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true, comment: "模型间 rating 一致率 0-100" },
      judge_model_id: { type: DataTypes.STRING(64), allowNull: true },
    },
    { tableName: "poker_eval_runs", underscored: true }
  );

  PokerEvalResult = sequelize.define(
    "PokerEvalResult",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      eval_run_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      hand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: "冗余，便于直查" },
      model_id: { type: DataTypes.STRING(64), allowNull: false },
      provider: { type: DataTypes.STRING(32), allowNull: false },
      status: { type: DataTypes.ENUM("success", "failed", "timeout"), allowNull: false },
      latency_ms: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      prompt_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      completion_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      cached_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      cost_usd: { type: DataTypes.DECIMAL(10, 6), allowNull: true, defaultValue: 0 },
      structured_output: { type: DataTypes.JSON, allowNull: true, comment: "schema 合规时保存 analyses 数组" },
      raw_response: { type: DataTypes.TEXT, allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      schema_valid: { type: DataTypes.BOOLEAN, allowNull: true },
      judge_score: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
      judge_notes: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "poker_eval_results", underscored: true }
  );
```

- [ ] **Step 2: 在 `afterSync(qi)` 函数中，现有 `try/catch` 块之后追加新索引**

```js
  try {
    await qi.addIndex("poker_eval_runs", ["hand_id", "created_at"], {
      name: "idx_eval_runs_hand_time",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_eval_runs", ["user_id", "created_at"], {
      name: "idx_eval_runs_user_time",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_eval_results", ["eval_run_id"], {
      name: "idx_eval_results_run",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_eval_results", ["hand_id", "model_id"], {
      name: "idx_eval_results_hand_model",
    });
  } catch (_) {}
```

- [ ] **Step 3: 在 `module.exports` 中追加新的 getter**

将 `module.exports` 块替换为：

```js
module.exports = {
  define,
  afterSync,
  get PokerUser()       { return PokerUser; },
  get PokerHand()       { return PokerHand; },
  get PokerAnalysis()   { return PokerAnalysis; },
  get PokerLeak()       { return PokerLeak; },
  get PokerEvalRun()    { return PokerEvalRun; },
  get PokerEvalResult() { return PokerEvalResult; },
};
```

- [ ] **Step 4: 启动验证**

```bash
cd backend && pnpm dev
```

期望：启动日志出现 `[DB] 数据库初始化完成`，无报错。用数据库客户端确认 `poker_eval_runs` 和 `poker_eval_results` 两张表已创建。

- [ ] **Step 5: 提交**

```bash
git add backend/services/poker-coach/models.js
git commit -m "feat(eval): models.js 新增 PokerEvalRun / PokerEvalResult"
```

---

## Task 4: dao.js — 新增评估 CRUD

**Files:**
- Modify: `backend/services/poker-coach/dao.js`

- [ ] **Step 1: 在 `module.exports` 之前追加以下函数**

```js
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
```

- [ ] **Step 2: 在 `module.exports` 中追加新函数**

```js
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
```

- [ ] **Step 3: 提交**

```bash
git add backend/services/poker-coach/dao.js
git commit -m "feat(eval): dao.js 新增评估 CRUD 函数"
```

---

## Task 5: evaluator.js — Phase 1 核心评估

**Files:**
- Create: `backend/services/poker-coach/evaluator.js`

- [ ] **Step 1: 创建文件**

```js
/**
 * 扑克教练 — 多模型评估核心
 *
 * runEvaluation(opts): async generator，按完成顺序 yield SSE 事件。
 * 评估调用走 lingyaai 代理（OpenAI Chat Completions 兼容），非流式。
 */

const { POKER_SYSTEM_PROMPT } = require("./brain-config");
const { buildHandContext } = require("./hand-context");
const { calculateCost } = require("../core/pricing");
const dao = require("./dao");

const LINGYAAI_API_URL = "https://api.lingyaai.cn/v1/chat/completions";
const EVAL_TIMEOUT_MS = 60000;
const JUDGE_MODEL_ID = "claude-sonnet-4-6";

const EVAL_MODELS = [
  { id: "claude-sonnet-4-5", provider: "anthropic", label: "Claude Sonnet 4.5" },
  { id: "gpt-4o",            provider: "openai",    label: "OpenAI GPT-4o"     },
  { id: "gemini-2.5-pro",    provider: "google",    label: "Gemini 2.5 Pro"    },
  { id: "deepseek-chat",     provider: "deepseek",  label: "DeepSeek V3"       },
  { id: "glm-4.6v",          provider: "zhipu",     label: "智谱 GLM-4.6V"      },
  { id: "qwen3.5-plus",      provider: "qwen",      label: "千问 Qwen3.5-Plus"  },
];

const EVAL_SYSTEM_SUFFIX = `

只输出一个 JSON 对象，不要任何前后说明文字。格式：
{"analyses":[{"street":"preflop|flop|turn|river","rating":"good|acceptable|problematic","scenario":"...","hero_action":"...","better_action":"...","reasoning":"...","principle":"..."}]}
对手牌中每条实际有行动的街各给一条分析。如果不按此 JSON 格式返回则视为无效。`;

// ===== Schema 校验 =====

function validateSchema(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (!Array.isArray(parsed.analyses) || parsed.analyses.length === 0) return false;
  const validStreets = new Set(["preflop", "flop", "turn", "river"]);
  const validRatings = new Set(["good", "acceptable", "problematic"]);
  for (const a of parsed.analyses) {
    if (!validStreets.has(a.street)) return false;
    if (!validRatings.has(a.rating)) return false;
    if (!a.scenario || !a.reasoning || !a.principle) return false;
  }
  return true;
}

// ===== 单模型调用 =====

async function callModel(model, handContext, systemPrompt, apiKey, evalRunId, handId) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EVAL_TIMEOUT_MS);

  try {
    const resp = await fetch(LINGYAAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: handContext },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (!resp.ok) {
      const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
      const resultId = await dao.saveEvalResult(evalRunId, handId, {
        model_id: model.id, provider: model.provider,
        status: "failed", latency_ms: latencyMs, error_message: errText,
      });
      return { model_id: model.id, status: "failed", latency_ms: latencyMs, error_message: errText, result_id: resultId };
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || {};
    const cost = calculateCost(model.id, usage);

    let parsed = null;
    let schemaValid = false;
    try {
      const cleaned = rawContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(cleaned);
      schemaValid = validateSchema(parsed);
    } catch (_) {}

    const resultId = await dao.saveEvalResult(evalRunId, handId, {
      model_id: model.id, provider: model.provider, status: "success",
      latency_ms: latencyMs,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      cached_tokens: usage.prompt_tokens_details?.cached_tokens || null,
      cost_usd: cost,
      structured_output: schemaValid ? parsed.analyses : null,
      raw_response: rawContent,
      schema_valid: schemaValid,
    });

    return {
      model_id: model.id, status: "success", latency_ms: latencyMs,
      prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
      cost_usd: cost, schema_valid: schemaValid,
      structured_output: schemaValid ? parsed.analyses : null,
      result_id: resultId,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const isTimeout = err.name === "AbortError";
    const resultId = await dao.saveEvalResult(evalRunId, handId, {
      model_id: model.id, provider: model.provider,
      status: isTimeout ? "timeout" : "failed",
      latency_ms: latencyMs, error_message: err.message,
    });
    return {
      model_id: model.id, status: isTimeout ? "timeout" : "failed",
      latency_ms: latencyMs, error_message: err.message, result_id: resultId,
    };
  }
}

// ===== 裁判模型打分（Phase 2）=====

async function judgeEvaluation(evalRunId, hand, allResults, apiKey) {
  const successful = allResults.filter((r) => r.status === "success" && r.schema_valid);
  if (successful.length === 0) return null;

  const handContext = buildHandContext(hand);
  const modelAnalyses = successful
    .map((r) => `=== ${r.model_id} ===\n${JSON.stringify(r.structured_output, null, 2)}`)
    .join("\n\n");

  const judgePrompt = `你是一位德州扑克教练，请评估以下多个 AI 模型对同一手牌的分析质量。

手牌信息：
${handContext}

各模型分析：
${modelAnalyses}

请对每个模型的分析打分（1-5分），输出格式：
{"scores":[{"model_id":"...","score":4,"notes":"简短评语（一句话）"}]}
只输出 JSON，不要其他文字。`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EVAL_TIMEOUT_MS);

  try {
    const resp = await fetch(LINGYAAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: JUDGE_MODEL_ID,
        messages: [{ role: "user", content: judgePrompt }],
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) return null;

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    const cleaned = rawContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsedJudge = JSON.parse(cleaned);

    if (!Array.isArray(parsedJudge.scores)) return null;

    await dao.saveJudgeScores(evalRunId, parsedJudge.scores);
    await dao.finalizeEvalRun(evalRunId, { judgeModelId: JUDGE_MODEL_ID });

    return { judge_model_id: JUDGE_MODEL_ID, scores: parsedJudge.scores };
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}

// ===== 评估主流程 =====

async function* runEvaluation({ userId, handId, modelIds, apiKey }) {
  const hand = await dao.getHandWithAnalyses(handId, userId);
  if (!hand) throw new Error("手牌不存在");

  const models = modelIds
    ? EVAL_MODELS.filter((m) => modelIds.includes(m.id))
    : EVAL_MODELS;
  if (models.length === 0) throw new Error("无有效模型");

  const evalRunId = await dao.createEvalRun(userId, handId, models.map((m) => m.id));
  const systemPrompt = POKER_SYSTEM_PROMPT + EVAL_SYSTEM_SUFFIX;
  const handContext = buildHandContext(hand);

  yield { type: "eval_started", eval_run_id: evalRunId, hand_id: handId, models };
  for (const m of models) {
    yield { type: "eval_model_started", eval_run_id: evalRunId, model_id: m.id };
  }

  // 队列：按完成顺序 yield
  const resultQueue = [];
  const waiters = [];

  function enqueue(item) {
    if (waiters.length > 0) {
      waiters.shift()(item);
    } else {
      resultQueue.push(item);
    }
  }

  function dequeue() {
    if (resultQueue.length > 0) return Promise.resolve(resultQueue.shift());
    return new Promise((resolve) => waiters.push(resolve));
  }

  models.forEach((m) => {
    callModel(m, handContext, systemPrompt, apiKey, evalRunId, handId)
      .then((r) => enqueue(r))
      .catch((err) => enqueue({ model_id: m.id, status: "failed", error_message: err.message }));
  });

  const allResults = [];
  for (let i = 0; i < models.length; i++) {
    const result = await dequeue();
    allResults.push(result);
    yield { type: "eval_model_done", eval_run_id: evalRunId, model_id: result.model_id, result };
  }

  // 裁判阶段
  const judgeResult = await judgeEvaluation(evalRunId, hand, allResults, apiKey);
  if (judgeResult) {
    yield { type: "eval_judge_done", eval_run_id: evalRunId, ...judgeResult };
  }

  // 汇总
  const consistencyScore = await dao.computeConsistency(evalRunId, hand);
  const totalCostUsd = Number(
    allResults.reduce((sum, r) => sum + (r.cost_usd || 0), 0).toFixed(6)
  );
  const successCount = allResults.filter((r) => r.status === "success").length;
  const status =
    successCount === models.length ? "completed" : successCount > 0 ? "partial" : "failed";

  await dao.finalizeEvalRun(evalRunId, { status, totalCostUsd, consistencyScore });

  yield { type: "eval_completed", eval_run_id: evalRunId, consistency_score: consistencyScore, total_cost_usd: totalCostUsd, status };
}

module.exports = { runEvaluation, EVAL_MODELS, JUDGE_MODEL_ID };
```

- [ ] **Step 2: 语法检查**

```bash
cd backend && node -e "require('./services/poker-coach/evaluator'); console.log('evaluator 语法 OK')"
```

期望输出：`evaluator 语法 OK`

- [ ] **Step 3: 提交**

```bash
git add backend/services/poker-coach/evaluator.js
git commit -m "feat(eval): 新增评估核心 evaluator.js（含裁判模型）"
```

---

## Task 6: poker.js — 新增 3 个评估路由

**Files:**
- Modify: `backend/routes/poker.js`

- [ ] **Step 1: 在文件顶部的 `require` 块末尾追加**

```js
const { runEvaluation } = require("../services/poker-coach/evaluator");
```

- [ ] **Step 2: 在 `handleGetLeaks` 函数之后、路由组装之前，追加 3 个 handler**

```js
// ===== SSE：多模型评估 =====

async function handleEvalRun(req, res) {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) return res.status(401).json({ error: "缺少 API Key" });

    const handId = parseInt(req.body.hand_id, 10);
    if (!handId) return res.status(400).json({ error: "缺少 hand_id" });

    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "缺少用户标识" });

    const belongs = await dao.handBelongsToUser(handId, userId);
    if (!belongs) return res.status(404).json({ error: "手牌不存在" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const modelIds = Array.isArray(req.body.model_ids) ? req.body.model_ids : null;
    for await (const event of runEvaluation({ userId, handId, modelIds, apiKey })) {
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }

    res.write("data: [DONE]\n\n");
    res.end();
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
```

- [ ] **Step 3: 在 `pokerRouter` 路由注册块末尾追加**

```js
pokerRouter.post("/eval/runs", handleEvalRun);
pokerRouter.get("/eval/runs", handleListEvalRuns);
pokerRouter.get("/eval/runs/:id", handleGetEvalRun);
```

- [ ] **Step 4: 启动并验证路由注册**

```bash
cd backend && pnpm dev
```

另开终端：

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/poker/eval/runs
```

期望：`401`（缺少用户标识，说明路由已注册且权限校验正常）

- [ ] **Step 5: 提交**

```bash
git add backend/routes/poker.js
git commit -m "feat(eval): poker.js 新增评估路由 POST/GET /api/poker/eval/runs"
```

---

## Task 7: types.js — MODEL_CONFIG 扩展

**Files:**
- Modify: `backend/demo/poker-coach/js/types.js`

- [ ] **Step 1: 将 `MODEL_CONFIG` 整块替换**

旧内容（第 3-12 行）：
```js
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
```

替换为：
```js
var MODEL_CONFIG = {
  "qwen3.5-plus":      { label: "千问 Qwen 3.5 Plus",   provider: "qwen"      },
  "glm-4.6v":          { label: "智谱 GLM-4.6V",         provider: "zhipu"     },
  "claude-sonnet-4-5": { label: "Claude Sonnet 4.5",    provider: "anthropic" },
  "gpt-4o":            { label: "OpenAI GPT-4o",        provider: "openai"    },
  "gemini-2.5-pro":    { label: "Gemini 2.5 Pro",       provider: "google"    },
  "deepseek-chat":     { label: "DeepSeek V3",          provider: "deepseek"  },
};

// 评估用模型清单（compare.html 使用）
var EVAL_MODEL_IDS = [
  "claude-sonnet-4-5", "gpt-4o", "gemini-2.5-pro",
  "deepseek-chat", "glm-4.6v", "qwen3.5-plus",
];
```

- [ ] **Step 2: 提交**

```bash
git add backend/demo/poker-coach/js/types.js
git commit -m "feat(eval): types.js 扩展 MODEL_CONFIG，修复 glm-4-plus → glm-4.6v"
```

---

## Task 8: profile.html — 新增 lingyaai API Key

**Files:**
- Modify: `backend/demo/poker-coach/profile.html`

- [ ] **Step 1: 模型选择下拉的 `glm-4-plus` 改为 `glm-4.6v`**

旧：
```html
<option value="glm-4-plus">智谱 GLM-4 Plus</option>
```

新：
```html
<option value="glm-4.6v">智谱 GLM-4.6V</option>
```

- [ ] **Step 2: 在智谱 API Key 的 `</div>` 之后、API Key card 的 `</div></div>` 之前，追加 lingyaai 输入框**

```html
          <div class="form-group">
            <label class="form-label">
              lingyaai API Key
              <span style="font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);font-weight:normal;">（横向评估用）</span>
            </label>
            <input class="form-control" type="password" id="lingyaaiKey"
              placeholder="sk-xxxxxxxxxxxxxxxx" autocomplete="off" />
            <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-faint);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px;">
              前往 lingyaai.cn 获取
            </div>
          </div>
```

- [ ] **Step 3: 更新 `loadProfile()` 函数**

在 `document.getElementById("zhipuKey").value = ...` 这行后追加：
```js
      document.getElementById("lingyaaiKey").value = (settings.apiKeys && settings.apiKeys.lingyaai) || "";
```

- [ ] **Step 4: 更新 `saveProfile()` 函数**

在 `var zhipuKey = ...` 这行后追加：
```js
      var lingyaaiKey = document.getElementById("lingyaaiKey").value.trim();
```

在 `if (zhipuKey) settings.apiKeys.zhipu = zhipuKey; else delete settings.apiKeys.zhipu;` 这行后追加：
```js
      if (lingyaaiKey) settings.apiKeys.lingyaai = lingyaaiKey;
      else delete settings.apiKeys.lingyaai;
```

- [ ] **Step 5: 提交**

```bash
git add backend/demo/poker-coach/profile.html
git commit -m "feat(eval): profile.html 新增 lingyaai API Key 输入框"
```

---

## Task 9: analysis.html — 新增"横向对比"入口按钮

**Files:**
- Modify: `backend/demo/poker-coach/analysis.html`

- [ ] **Step 1: 在 `<!-- 开始分析按钮 -->` 区域的 `</div>` 之后（第 53 行 `</div>` 后）追加**

```html
        <!-- 横向对比入口 -->
        <div id="compareButtonArea" style="display:none;">
          <a id="compareBtn" href="#" class="btn btn-secondary btn-full"
            style="display:block;text-align:center;text-decoration:none;">
            横向对比多模型 →
          </a>
        </div>
```

- [ ] **Step 2: 在 `analysis.js` 的 `renderExistingAnalyses` 函数中，`showChatArea()` 调用后追加**

在 `showChatArea();` 这行（约 139 行）之后：
```js
  showCompareButton();
```

- [ ] **Step 3: 在 `analysis.js` 中追加 `showCompareButton` 函数（在 `showChatArea` 函数之后）**

```js
function showCompareButton() {
  var area = document.getElementById("compareButtonArea");
  var btn = document.getElementById("compareBtn");
  if (area && btn && HAND_ID) {
    btn.href = "/poker/compare.html?hand_id=" + HAND_ID;
    area.style.display = "block";
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add backend/demo/poker-coach/analysis.html backend/demo/poker-coach/js/analysis.js
git commit -m "feat(eval): analysis.html 新增横向对比入口按钮"
```

---

## Task 10: compare.html + compare.js

**Files:**
- Create: `backend/demo/poker-coach/compare.html`
- Create: `backend/demo/poker-coach/js/compare.js`

- [ ] **Step 1: 创建 compare.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>模型对比 — 扑克教练</title>
  <link rel="stylesheet" href="/poker/css/style.css" />
  <style>
    .eval-table { width: 100%; border-collapse: collapse; min-width: 560px; font-size: 13px; }
    .eval-table th, .eval-table td { border: 1px solid var(--ink-line); padding: 6px 8px; text-align: center; vertical-align: top; }
    .eval-table th { background: var(--bg-card); font-weight: 600; font-size: 12px; }
    .eval-table td:first-child { text-align: left; font-weight: 600; white-space: nowrap; color: var(--ink-soft); width: 52px; }
    .eval-table tfoot td { font-size: 11px; color: var(--ink-soft); }
    .cell-detail { text-align: left; margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--ink); display: none; }
    .cell-detail .cf { margin-bottom: 4px; }
    .cell-detail .cf-label { color: var(--ink-faint); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .eval-cell { cursor: pointer; }
    .eval-cell:hover { background: var(--bg-page); }
    .kpi-grid { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 16px 0; }
    .kpi-card { flex: 1; min-width: 120px; background: var(--bg-card); border: 1px solid var(--ink-line); border-radius: 8px; padding: 10px 12px; }
    .kpi-value { font-size: 20px; font-weight: 700; color: var(--ink); }
    .kpi-label { font-size: 11px; color: var(--ink-faint); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .model-checkbox-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="page" id="page">
    <div class="topbar">
      <a href="#" class="btn-icon" id="backBtn">←</a>
      <span class="topbar-title" style="font-size:20px;">模型对比</span>
    </div>

    <div style="flex:1;overflow-y:auto;">

      <!-- KPI -->
      <div class="kpi-grid" id="kpiGrid" style="display:none;"></div>

      <!-- 历史批次 + 模型选择 + 操作按钮 -->
      <div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;">

        <div class="card">
          <div class="card-header"><span class="card-title">历史批次</span></div>
          <div class="card-body">
            <select class="form-control" id="historySelect">
              <option value="">— 新建评估 —</option>
            </select>
          </div>
        </div>

        <div class="card" id="newEvalCard">
          <div class="card-header">
            <span class="card-title">选择模型</span>
            <button class="btn btn-sm btn-secondary" onclick="toggleAllModels()">全选/取消</button>
          </div>
          <div class="card-body" id="modelCheckboxes"></div>
        </div>

        <button class="btn btn-primary btn-full" id="startBtn" onclick="startEval()">开始评估</button>

      </div>

      <!-- 结果表格 -->
      <div style="padding:0 16px 24px;overflow-x:auto;" id="tableArea" style="display:none;">
        <table class="eval-table" id="evalTable"></table>
      </div>

    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script src="/poker/js/types.js"></script>
  <script src="/poker/js/storage.js"></script>
  <script src="/poker/js/compare.js"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 compare.js**

```js
// ===== 初始化 =====

var HAND_ID = parseInt(new URLSearchParams(location.search).get("hand_id"), 10) || null;
var currentModels = []; // 当前评估中的模型列表

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
  initTable(currentModels);

  try {
    var resp = await fetch("/api/poker/eval/runs", {
      method: "POST",
      headers: buildEvalHeaders(),
      body: JSON.stringify({ hand_id: HAND_ID, model_ids: modelIds }),
    });
    if (!resp.ok) { showToast("评估启动失败"); btn.disabled = false; btn.textContent = "开始评估"; return; }

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split("\n");
      buffer = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.startsWith("data: ")) continue;
        var raw = line.slice(6).trim();
        if (raw === "[DONE]") break;
        try { handleEvalEvent(JSON.parse(raw)); } catch (_) {}
      }
    }
  } catch (e) {
    showToast("评估失败: " + e.message);
  }

  btn.disabled = false;
  btn.textContent = "开始评估";

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
    fillModelColumn(evt.model_id, evt.result);
  } else if (evt.type === "eval_judge_done") {
    fillJudgeRow(evt.scores);
  } else if (evt.type === "eval_completed") {
    renderKPI(evt, null);
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
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ===== 启动 =====
init();
```

- [ ] **Step 3: 端对端验证**

启动后端后在浏览器访问：
```
http://localhost:80/poker/compare.html?hand_id=1
```

检查：
- 页面正常加载，显示 6 个模型复选框
- "开始评估"按钮可点击
- 若无 lingyaai key 点击后提示"请先配置"

- [ ] **Step 4: 提交**

```bash
git add backend/demo/poker-coach/compare.html backend/demo/poker-coach/js/compare.js
git commit -m "feat(eval): 新增 compare.html + compare.js 评估前端"
```

---

## Task 11: 完整评估联调验证

本 Task 无代码变更，仅做完整功能验证。

- [ ] **Step 1: 配置 lingyaai key**

在浏览器访问 `http://localhost:80/poker/profile.html`，填入 lingyaai API Key 并保存。

- [ ] **Step 2: 录入测试手牌（若无）**

```bash
curl -s -X POST http://localhost:80/api/poker/hands \
  -H "Content-Type: application/json" \
  -H "X-Anon-Token: test-token-001" \
  -d '{
    "blind_level": "1/2",
    "hero_position": "BTN",
    "hero_cards": "AsKd",
    "preflop_actions": "UTG fold, CO fold, BTN raise 3BB, SB fold, BB call",
    "flop_cards": "Ah 7h 2c",
    "flop_actions": "BB check, BTN bet 5BB, BB call"
  }'
```

记录返回的 `hand_id`。

- [ ] **Step 3: 触发评估，观察 SSE 流**

```bash
curl -N -s -X POST http://localhost:80/api/poker/eval/runs \
  -H "Content-Type: application/json" \
  -H "X-Anon-Token: test-token-001" \
  -H "X-Api-Key: YOUR_LINGYAAI_KEY" \
  -d '{"hand_id": 1, "model_ids": ["gpt-4o", "deepseek-chat"]}'
```

期望输出：
```
data: {"type":"eval_started",...}
data: {"type":"eval_model_started","model_id":"gpt-4o"}
data: {"type":"eval_model_started","model_id":"deepseek-chat"}
data: {"type":"eval_model_done","model_id":"..."}
data: {"type":"eval_model_done","model_id":"..."}
data: {"type":"eval_judge_done",...}
data: {"type":"eval_completed",...}
data: [DONE]
```

- [ ] **Step 4: 验证数据库落库**

```bash
curl -s "http://localhost:80/api/poker/eval/runs?hand_id=1" \
  -H "X-Anon-Token: test-token-001"
```

期望：返回包含刚才 run 的列表，`status` 为 `completed` 或 `partial`。

- [ ] **Step 5: 在浏览器联调前端**

访问 `http://localhost:80/poker/analysis.html?hand_id=1`，确认：
- 底部出现"横向对比多模型 →"按钮
- 点击跳转到 compare.html
- 勾选 2 个模型，点击"开始评估"
- 表格按完成顺序填充
- 顶部 KPI 在 `eval_completed` 后更新
- "历史批次"下拉可切换查看刚才的 run

---

## Task 12: docs — 同步文档

**Files:**
- Modify: `docs/api/poker.md`
- Modify: `docs/db/poker.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: docs/api/poker.md — 追加评估体系章节**

在文件末尾追加：

```markdown
---

## 大模型横向评估

### POST /api/poker/eval/runs

触发多模型并发评估（SSE 流式）。评估调用走 lingyaai 统一代理，不影响主对话路径。

**请求头**：`X-Api-Key`（lingyaai key，必填）、`X-Anon-Token` / `X-Wx-OpenId`（必填）

**请求体**

```json
{
  "hand_id": 42,
  "model_ids": ["gpt-4o", "deepseek-chat"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hand_id` | number | 是 | 手牌 ID |
| `model_ids` | array | 否 | 指定模型子集；省略则用全部 6 款 |

**SSE 事件序列**

```
data: {"type":"eval_started","eval_run_id":7,"hand_id":42,"models":[...]}
data: {"type":"eval_model_started","eval_run_id":7,"model_id":"gpt-4o"}
data: {"type":"eval_model_done","eval_run_id":7,"model_id":"gpt-4o","result":{"status":"success","latency_ms":3420,"prompt_tokens":1205,"completion_tokens":680,"cost_usd":0.009814,"schema_valid":true,"structured_output":[...]}}
data: {"type":"eval_judge_done","eval_run_id":7,"judge_model_id":"claude-sonnet-4-6","scores":[{"model_id":"gpt-4o","score":4,"notes":"..."}]}
data: {"type":"eval_completed","eval_run_id":7,"consistency_score":66.7,"total_cost_usd":0.042318,"status":"completed"}
data: [DONE]
```

---

### GET /api/poker/eval/runs?hand_id=:id

列出某手牌的所有历史评估批次。

**响应**

```json
{ "runs": [{ "id": 7, "status": "completed", "consistency_score": 66.7, "total_cost_usd": 0.042318, "requested_models": ["gpt-4o", ...], "created_at": "..." }] }
```

---

### GET /api/poker/eval/runs/:id

获取单个评估批次详情，含所有模型结果。

**响应**

```json
{
  "id": 7, "hand_id": 42, "status": "completed",
  "consistency_score": 66.7, "total_cost_usd": 0.042318,
  "results": [
    { "model_id": "gpt-4o", "status": "success", "latency_ms": 3420,
      "prompt_tokens": 1205, "completion_tokens": 680, "cost_usd": 0.009814,
      "schema_valid": true, "structured_output": [...],
      "judge_score": 4, "judge_notes": "..." }
  ]
}
```
```

- [ ] **Step 2: docs/db/poker.md — 追加两表结构**

在文件末尾追加：

```markdown
---

## poker_eval_runs

评估批次记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK | 自增主键 |
| `user_id` | INT UNSIGNED | FK → poker_users.id |
| `hand_id` | INT UNSIGNED | FK → poker_hands.id |
| `requested_models` | JSON | 请求的模型 ID 数组 |
| `status` | ENUM | running / completed / partial / failed |
| `total_cost_usd` | DECIMAL(10,6) | 批次累计成本 |
| `consistency_score` | DECIMAL(5,2) | 模型间 rating 一致率（0-100） |
| `judge_model_id` | VARCHAR(64) | 裁判模型 ID（可空） |
| `created_at` / `updated_at` | DATETIME | — |

**索引**：`idx_eval_runs_hand_time (hand_id, created_at)`、`idx_eval_runs_user_time (user_id, created_at)`

---

## poker_eval_results

单模型评估产物。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK | — |
| `eval_run_id` | INT UNSIGNED | FK → poker_eval_runs.id |
| `hand_id` | INT UNSIGNED | 冗余，便于直查 |
| `model_id` | VARCHAR(64) | 模型标识符 |
| `provider` | VARCHAR(32) | anthropic / openai / google / deepseek / zhipu / qwen |
| `status` | ENUM | success / failed / timeout |
| `latency_ms` | INT UNSIGNED | 响应延迟 |
| `prompt_tokens` | INT UNSIGNED | — |
| `completion_tokens` | INT UNSIGNED | — |
| `cached_tokens` | INT UNSIGNED | 可空 |
| `cost_usd` | DECIMAL(10,6) | 单次成本 |
| `structured_output` | JSON | schema 合规时的 analyses 数组 |
| `raw_response` | TEXT | 原始响应文本 |
| `error_message` | TEXT | 失败原因（可空） |
| `schema_valid` | BOOLEAN | JSON 是否合规 |
| `judge_score` | TINYINT UNSIGNED | 裁判评分 1-5（可空） |
| `judge_notes` | TEXT | 裁判评语（可空） |
| `created_at` / `updated_at` | DATETIME | — |

**索引**：`idx_eval_results_run (eval_run_id)`、`idx_eval_results_hand_model (hand_id, model_id)`
```

- [ ] **Step 3: CLAUDE.md — 更新 API 列表**

在 CLAUDE.md 的 `## 后端 API` 章节，`GET /api/poker/leaks` 那行之后追加：

```
- `POST /api/poker/eval/runs` — 触发多模型横向评估（SSE；并发调用 6 款模型，裁判打分，一致率统计）
- `GET /api/poker/eval/runs?hand_id=:id` — 列出手牌的历史评估批次
- `GET /api/poker/eval/runs/:id` — 批次详情（含所有模型结果）
```

- [ ] **Step 4: 提交**

```bash
git add docs/api/poker.md docs/db/poker.md CLAUDE.md
git commit -m "docs: 同步评估体系 API、表结构和 CLAUDE.md"
```

---

## 自审检查清单

- [x] **spec 覆盖**：pricing / hand-context / evaluator / 3 路由 / models / dao(7函数) / compare.html / compare.js / profile lingyaai key / analysis 入口按钮 / 裁判模型 / 文档 — 全覆盖
- [x] **占位符扫描**：无 TBD / TODO / "类似 Task N" 等
- [x] **类型一致性**：`saveEvalResult` 返回 `resultId`；`dao.saveJudgeScores(evalRunId, scores)` 参数与 evaluator 调用一致；`getEvalRun` 返回 `{ ...run, results: [...] }` 与 compare.js `run.results` 读取一致；`fillModelColumn` 接收 result 对象字段与 SSE `eval_model_done.result` 字段对齐
- [x] **主对话路径不改动**：`llm.js` / `brain.js` / `skill-registry.js` / `skills.js` / `brain-config.js` / `POST /completions` 均无修改
