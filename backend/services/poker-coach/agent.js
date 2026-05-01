/**
 * 扑克教练 — Agent 核心
 *
 * 三种调用模式（async generator，逐步 yield SSE 事件）：
 *   - runAnalysis: 单手逐街复盘。LLM 返回 JSON，校验后落库 poker_analyses（可附带 leaks）。
 *   - runLeak:     Leak 专项归纳。LLM 返回 JSON，校验后落库 poker_leaks。
 *   - runChat:     自由追问对话（流式文本，无结构化约束）。
 *
 * 设计要点：
 *   - 不再依赖工具调用（tool_calls）。结构化结果通过 JSON 模板 + 后端解析校验完成。
 *   - 校验失败带错误反馈追问一次（最多重试 1 次）。
 *   - 落库 + 元数据写入由本模块负责，路由层只需按事件流写 SSE。
 */

const { chat, chatStream } = require("../core/llm");
const { calculateCost } = require("../core/pricing");
const dao = require("./dao");
const { buildHandContext, validateAnalysisItems, stripJsonWrapper } = require("./hand-context");
const {
  ANALYSIS_SYSTEM_PROMPT,
  LEAK_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
} = require("./prompts");

const MAX_RETRY = 1;

// ===== JSON 模板（追加在 system prompt 末尾）=====

const ANALYSIS_FORMAT_INSTRUCTION = `

## 输出格式

只输出一个 JSON 对象，不要任何前后说明文字、不要 Markdown 代码块包裹。结构如下：

{
  "analyses": [
    {
      "street": "preflop|flop|turn|river",
      "scenario": "场景复述（位置、底池、对手行动、Hero 选择，50-100 字）",
      "rating": "good|acceptable|problematic",
      "hero_action": "Hero 的实际操作（10 字以内）",
      "better_action": "更优选择的描述（rating 为 good 时可省略此字段或为空字符串）",
      "reasoning": "推理解释（教练口吻，100-200 字）",
      "principle": "背后的通用德扑原则（30-60 字）"
    }
  ],
  "leaks": [
    {
      "pattern": "Leak 描述（场景 + 问题 + 频率）",
      "occurrences": 3,
      "example_hand_ids": [12, 18, 25]
    }
  ]
}

字段说明：
- analyses 至少 1 项；对每条有行动记录的街都给一条分析。
- leaks 字段可选；若历史不足或无明显规律，省略此字段或传空数组即可。传入后会替换该用户全部 Leak 记录。
- 如果不按此 JSON 格式返回，则视为无效。`;

const LEAK_FORMAT_INSTRUCTION = `

## 输出格式

只输出一个 JSON 对象，不要任何前后说明文字、不要 Markdown 代码块包裹。结构如下：

{
  "leaks": [
    {
      "pattern": "Leak 描述（场景 + 问题 + 频率）",
      "occurrences": 4,
      "example_hand_ids": [42, 38, 31]
    }
  ]
}

字段说明：
- leaks 至少 1 项。若用户历史无明显规律，可返回空数组（注意此时已有 Leak 记录会被清空）。
- 如果不按此 JSON 格式返回，则视为无效。`;

// ===== Schema 校验 =====

function validateAnalysisPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return "顶层不是对象";
  const analysesErr = validateAnalysisItems(parsed.analyses);
  if (analysesErr) return analysesErr;
  if (parsed.leaks !== undefined && !Array.isArray(parsed.leaks)) {
    return "leaks 字段存在但不是数组";
  }
  if (Array.isArray(parsed.leaks)) {
    for (let i = 0; i < parsed.leaks.length; i++) {
      const l = parsed.leaks[i];
      if (!l || typeof l !== "object" || !l.pattern || typeof l.pattern !== "string") {
        return `leaks[${i}] pattern 字段缺失`;
      }
    }
  }
  return null;
}

function validateLeakPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return "顶层不是对象";
  if (!Array.isArray(parsed.leaks)) return "leaks 字段缺失或非数组";
  for (let i = 0; i < parsed.leaks.length; i++) {
    const l = parsed.leaks[i];
    if (!l || typeof l !== "object" || !l.pattern || typeof l.pattern !== "string") {
      return `leaks[${i}] pattern 字段缺失`;
    }
  }
  return null;
}

function tryParseJson(rawContent) {
  if (!rawContent) return null;
  try {
    return JSON.parse(stripJsonWrapper(rawContent));
  } catch (_) {
    return null;
  }
}

// ===== 重试调用：最多发起 (MAX_RETRY + 1) 次 LLM 请求，每次收集 token 用量 =====

async function* callWithSchemaRetry({
  model,
  apiKey,
  systemPrompt,
  userPrompt,
  validate,
  logTag,
}) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    console.log(`[${logTag}] 第 ${attempt + 1} 次调用 model=${model}`);
    const { content, usage } = await chat(model, messages, apiKey, {
      response_format: { type: "json_object" },
    });

    if (usage) {
      yield { type: "llm_usage", usage, model };
    }

    const parsed = tryParseJson(content);
    const schemaError = parsed ? validate(parsed) : "JSON 解析失败";
    if (!schemaError) {
      console.log(`[${logTag}] 第 ${attempt + 1} 次调用通过 schema 校验`);
      return { parsed, content };
    }

    lastError = schemaError;
    console.warn(
      `[${logTag}] 第 ${attempt + 1} 次调用 schema 校验失败：${schemaError}，原始片段：${(content || "").slice(0, 200)}`
    );

    if (attempt < MAX_RETRY) {
      // 把模型的错误输出和反馈塞回对话，让它修正
      messages.push({ role: "assistant", content: content || "" });
      messages.push({
        role: "user",
        content: `你刚才的输出未通过校验：${schemaError}。请严格按要求的 JSON 格式重新输出，不要任何前后说明文字、不要 Markdown 代码块包裹。`,
      });
    }
  }

  throw new Error(`模型连续 ${MAX_RETRY + 1} 次未返回合规 JSON：${lastError}`);
}

// ===== 模式一：单手分析 =====

async function* runAnalysis({ hand, recentAnalyses, totalHands, analyzedHands, model, apiKey, userId }) {
  const systemPrompt = ANALYSIS_SYSTEM_PROMPT + ANALYSIS_FORMAT_INSTRUCTION;
  const userPromptParts = [
    `用户概况：已录入 ${totalHands} 手，其中 ${analyzedHands} 手已分析。`,
    "",
    "## 待分析手牌",
    "",
    buildHandContext(hand),
  ];
  if (recentAnalyses && recentAnalyses.length > 0) {
    userPromptParts.push(
      "",
      `## 历史分析记录（供 Leak 识别参考，共 ${recentAnalyses.length} 条）`,
      "",
      "```json",
      JSON.stringify(recentAnalyses, null, 2),
      "```"
    );
  }
  userPromptParts.push("", "请按系统提示词中的 JSON 格式输出分析结果。");
  const userPrompt = userPromptParts.join("\n");

  let cumulativePromptTokens = 0;
  let cumulativeCompletionTokens = 0;

  const inner = callWithSchemaRetry({
    model,
    apiKey,
    systemPrompt,
    userPrompt,
    validate: validateAnalysisPayload,
    logTag: "Agent/Analysis",
  });

  let result;
  while (true) {
    const next = await inner.next();
    if (next.done) {
      result = next.value;
      break;
    }
    const ev = next.value;
    if (ev.type === "llm_usage" && ev.usage) {
      cumulativePromptTokens += ev.usage.prompt_tokens || 0;
      cumulativeCompletionTokens += ev.usage.completion_tokens || 0;
    }
    yield ev;
  }

  const { parsed } = result;

  // 落库 analyses
  const savedAnalyses = await dao.saveAnalyses(hand.id, parsed.analyses);

  // 可选 leaks 一并落库
  let leaksSavedCount = 0;
  if (Array.isArray(parsed.leaks) && parsed.leaks.length > 0) {
    const savedLeaks = await dao.saveLeaks(userId, parsed.leaks);
    leaksSavedCount = savedLeaks.length;
  }

  // 写入分析元数据（model / token / cost）
  const cost = calculateCost(model, {
    prompt_tokens: cumulativePromptTokens,
    completion_tokens: cumulativeCompletionTokens,
  });
  console.log(
    `[Agent/Analysis] 落库 hand=${hand.id} analyses=${savedAnalyses.length} leaks=${leaksSavedCount} ` +
      `prompt=${cumulativePromptTokens} completion=${cumulativeCompletionTokens} cost=${cost}`
  );
  try {
    await dao.updateHandAnalysisMeta(hand.id, {
      analysis_model_id: model,
      analysis_prompt_tokens: cumulativePromptTokens,
      analysis_completion_tokens: cumulativeCompletionTokens,
      analysis_cost_usd: cost,
    });
  } catch (metaErr) {
    console.error("[Agent/Analysis] 写入元数据失败:", metaErr.message);
  }

  yield {
    type: "analysis_saved",
    hand_id: hand.id,
    saved_count: savedAnalyses.length,
    leaks_saved_count: leaksSavedCount,
  };
}

// ===== 模式二：Leak 专项归纳 =====

async function* runLeak({ recentAnalyses, totalHands, analyzedHands, model, apiKey, userId }) {
  const systemPrompt = LEAK_SYSTEM_PROMPT + LEAK_FORMAT_INSTRUCTION;
  const userPromptParts = [
    `用户概况：已录入 ${totalHands} 手，其中 ${analyzedHands} 手已分析。`,
    "",
    `## 历史分析记录（共 ${recentAnalyses.length} 条）`,
    "",
    "```json",
    JSON.stringify(recentAnalyses, null, 2),
    "```",
    "",
    "请按系统提示词中的 JSON 格式归纳 Leak 模式。",
  ];
  const userPrompt = userPromptParts.join("\n");

  const inner = callWithSchemaRetry({
    model,
    apiKey,
    systemPrompt,
    userPrompt,
    validate: validateLeakPayload,
    logTag: "Agent/Leak",
  });

  let result;
  while (true) {
    const next = await inner.next();
    if (next.done) {
      result = next.value;
      break;
    }
    yield next.value;
  }

  const { parsed } = result;
  const savedLeaks = await dao.saveLeaks(userId, parsed.leaks);
  console.log(`[Agent/Leak] 落库 leaks=${savedLeaks.length}`);

  yield { type: "leaks_saved", saved_count: savedLeaks.length };
}

// ===== 模式三：自由追问对话（流式）=====

async function* runChat({ messages, totalHands, analyzedHands, model, apiKey }) {
  const systemPrompt =
    CHAT_SYSTEM_PROMPT +
    `\n\n用户概况：已录入 ${totalHands} 手，其中 ${analyzedHands} 手已分析。`;

  const conversation = [{ role: "system", content: systemPrompt }, ...messages];

  let accContent = "";
  for await (const ev of chatStream(model, conversation, apiKey)) {
    if (ev.type === "content_delta") {
      accContent += ev.chunk;
      yield ev;
    } else if (ev.type === "done") {
      if (ev.usage) {
        yield { type: "llm_usage", usage: ev.usage, model };
      }
      yield { type: "answer", content: ev.content || accContent };
    }
  }
}

module.exports = { runAnalysis, runLeak, runChat };
