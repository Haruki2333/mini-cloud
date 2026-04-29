/**
 * 扑克教练 — 多模型评估核心
 *
 * runEvaluation(opts): async generator，按完成顺序 yield SSE 事件。
 * 评估调用走 lingyaai 代理（OpenAI Chat Completions 兼容），非流式。
 */

const fetch = require("node-fetch");
const { POKER_SYSTEM_PROMPT } = require("./prompts");
const { buildHandContext } = require("./hand-context");
const { calculateCost } = require("../core/pricing");
const dao = require("./dao");

const LINGYAAI_API_URL = "https://api.lingyaai.cn/v1/chat/completions";
const EVAL_TIMEOUT_MS = 60000;
const JUDGE_MODEL_ID = "claude-sonnet-4-6-thinking";

const EVAL_MODELS = [
  { id: "claude-sonnet-4-6-thinking",          provider: "anthropic", label: "Claude Sonnet 4.6 Thinking"          },
  { id: "gpt-5.4",                             provider: "openai",    label: "OpenAI GPT-5.4"                      },
  { id: "gemini-3.1-pro-preview-thinking",     provider: "google",    label: "Gemini 3.1 Pro Preview Thinking"     },
  { id: "deepseek-v4-pro",                     provider: "deepseek",  label: "DeepSeek V4 Pro"                     },
  { id: "doubao-seed-2-0-pro",                  provider: "volcengine", label: "Doubao Seed 2.0 Pro"                 },
  { id: "kimi-k2.6",                           provider: "moonshot",  label: "Kimi K2.6"                           },
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

function extractErrorMessage(rawText, status) {
  if (!rawText) return `HTTP ${status}`;
  try {
    const j = JSON.parse(rawText);
    const msg = j?.error?.message || j?.message || j?.error;
    if (typeof msg === "string" && msg) return `HTTP ${status}: ${msg}`;
  } catch (_) {}
  return `HTTP ${status}: ${rawText.slice(0, 200)}`;
}

async function callModel(model, handContext, systemPrompt, apiKey, evalRunId, handId) {
  const startTime = Date.now();
  console.log(`[Eval] 开始调用 ${model.id}  run=${evalRunId} apiKey=${apiKey ? apiKey.slice(0, 6) + "***" : "(空)"}`);

  try {
    // node-fetch v2 原生支持 timeout 选项，避免依赖部署环境是否提供全局 AbortController
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
      timeout: EVAL_TIMEOUT_MS,
    });

    const latencyMs = Date.now() - startTime;

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const cleanMsg = extractErrorMessage(errText, resp.status);
      console.error(`[Eval] ${model.id} HTTP ${resp.status} (${latencyMs}ms): ${errText.slice(0, 300)}`);
      const resultId = await dao.saveEvalResult(evalRunId, handId, {
        model_id: model.id, provider: model.provider,
        status: "failed", latency_ms: latencyMs, error_message: cleanMsg,
      });
      return { model_id: model.id, status: "failed", latency_ms: latencyMs, error_message: cleanMsg, result_id: resultId };
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

    let schemaError = null;
    if (!schemaValid) {
      schemaError = `输出格式不符合 schema，原始片段：${rawContent.slice(0, 120)}`;
      console.warn(`[Eval] ${model.id} schema 校验失败 (${latencyMs}ms), raw前200字: ${rawContent.slice(0, 200)}`);
    } else {
      console.log(`[Eval] ${model.id} 成功 (${latencyMs}ms) prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`);
    }

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
      error_message: schemaError,
    });

    return {
      model_id: model.id, status: "success", latency_ms: latencyMs,
      prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
      cost_usd: cost, schema_valid: schemaValid,
      structured_output: schemaValid ? parsed.analyses : null,
      error_message: schemaError,
      result_id: resultId,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    // node-fetch v2 超时抛 FetchError code=ETIMEDOUT
    const isTimeout = err.type === "request-timeout" || err.code === "ETIMEDOUT" || err.name === "AbortError";
    const msg = isTimeout
      ? `请求超时（>${EVAL_TIMEOUT_MS / 1000}s）`
      : err.message || String(err);
    console.error(`[Eval] ${model.id} ${isTimeout ? "超时" : "异常"} (${latencyMs}ms): ${msg}`, err.stack || "");
    const resultId = await dao.saveEvalResult(evalRunId, handId, {
      model_id: model.id, provider: model.provider,
      status: isTimeout ? "timeout" : "failed",
      latency_ms: latencyMs, error_message: msg,
    });
    return {
      model_id: model.id, status: isTimeout ? "timeout" : "failed",
      latency_ms: latencyMs, error_message: msg, result_id: resultId,
    };
  }
}

// ===== 裁判模型打分 =====

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
      timeout: EVAL_TIMEOUT_MS,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[Eval] 裁判 HTTP ${resp.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const rawContent = data.choices?.[0]?.message?.content || "";
    const cleaned = rawContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsedJudge = JSON.parse(cleaned);

    if (!Array.isArray(parsedJudge.scores)) return null;

    await dao.saveJudgeScores(evalRunId, parsedJudge.scores);
    await dao.finalizeEvalRun(evalRunId, { judgeModelId: JUDGE_MODEL_ID });

    return { judge_model_id: JUDGE_MODEL_ID, scores: parsedJudge.scores };
  } catch (err) {
    console.error(`[Eval] 裁判异常: ${err.message}`);
    return null;
  }
}

// ===== 评估主流程 =====

async function* runEvaluation({ userId, handId, modelIds, apiKey }) {
  console.log(`[Eval] 启动评估 hand=${handId} user=${userId} models=${modelIds || "all"}`);

  const hand = await dao.getHandWithAnalyses(handId, userId);
  if (!hand) throw new Error("手牌不存在");

  const models = modelIds
    ? EVAL_MODELS.filter((m) => modelIds.includes(m.id))
    : EVAL_MODELS;
  if (models.length === 0) throw new Error("无有效模型");

  const evalRunId = await dao.createEvalRun(userId, handId, models.map((m) => m.id));
  console.log(`[Eval] evalRun 已创建 id=${evalRunId}`);
  const systemPrompt = POKER_SYSTEM_PROMPT + EVAL_SYSTEM_SUFFIX;
  const handContext = buildHandContext(hand);

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

  // 在任何 yield 之前启动模型调用，确保 SSE 连接中断时调用已在飞行中
  console.log(`[Eval] 启动 ${models.length} 个并发模型调用`);
  models.forEach((m) => {
    callModel(m, handContext, systemPrompt, apiKey, evalRunId, handId)
      .then((r) => enqueue(r))
      .catch((err) => enqueue({ model_id: m.id, status: "failed", error_message: err.message }));
  });

  yield { type: "eval_started", eval_run_id: evalRunId, hand_id: handId, models };
  for (const m of models) {
    yield { type: "eval_model_started", eval_run_id: evalRunId, model_id: m.id };
  }

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
