const fetch = require("node-fetch");

const LINGYAAI_ENDPOINT = "https://api.lingyaai.cn/v1/chat/completions";

// 模型注册表（主对话 + 多模型评估均走 lingyaai 代理）
const MODEL_REGISTRY = {
  "gpt-5.4": {
    provider: "openai",
    label: "OpenAI GPT-5.4",
    endpoint: LINGYAAI_ENDPOINT,
    defaults: {},
  },
  "claude-sonnet-4-6-thinking": {
    provider: "anthropic",
    label: "Claude Sonnet 4.6 Thinking",
    endpoint: LINGYAAI_ENDPOINT,
    defaults: {},
  },
  "gemini-3.1-pro-preview-thinking": {
    provider: "google",
    label: "Gemini 3.1 Pro Preview Thinking",
    endpoint: LINGYAAI_ENDPOINT,
    defaults: {},
  },
  "deepseek-v4-pro": {
    provider: "deepseek",
    label: "DeepSeek V4 Pro",
    endpoint: LINGYAAI_ENDPOINT,
    defaults: {},
  },
  "doubao-seed-2-0-pro": {
    provider: "volcengine",
    label: "Doubao Seed 2.0 Pro",
    endpoint: LINGYAAI_ENDPOINT,
    defaults: {},
  },
  "kimi-k2.6": {
    provider: "moonshot",
    label: "Kimi K2.6",
    endpoint: LINGYAAI_ENDPOINT,
    defaults: {},
  },
};

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * 获取单个模型信息
 */
function getModelInfo(modelId) {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * 非流式大模型对话调用（stream: false）
 *
 * 用于结果一次性返回的场景（如 JSON 模板输出 + 后端校验落库）。
 *
 * @param {string} modelId
 * @param {Array} messages
 * @param {string} apiKey
 * @param {object} [options] - 透传给 OpenAI Chat Completions（如 response_format、timeout）
 * @returns {Promise<{ content: string, usage: object|null }>}
 */
async function chat(modelId, messages, apiKey, options = {}) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`不支持的模型: ${modelId}`);

  const { timeout, ...rest } = options;
  const body = {
    model: modelId,
    messages,
    stream: false,
    ...model.defaults,
    ...rest,
  };

  console.log(
    `[LLM/chat] >>> ${model.label}` +
      `，消息数: ${messages.length}` +
      (rest.response_format ? `，response_format=${rest.response_format.type}` : "")
  );

  const res = await fetch(model.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    timeout: timeout || DEFAULT_TIMEOUT_MS,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let errDetail = errText;
    try {
      const errJson = JSON.parse(errText);
      errDetail = errJson.error?.message || errJson.message || errText;
    } catch (_) {}
    throw new Error(`${model.label} 调用失败 (${res.status}): ${errDetail}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const usage = data.usage || null;

  console.log(
    `[LLM/chat] <<< ${model.label}` +
      (usage
        ? `，Token: 输入=${usage.prompt_tokens}, 输出=${usage.completion_tokens}`
        : "") +
      `，输出长度=${content.length}`
  );

  return { content, usage };
}

/**
 * 流式大模型对话调用（stream: true）
 *
 * 以 async generator 逐块 yield 事件：
 *   - { type: "content_delta", chunk }            — 普通文本增量
 *   - { type: "done", content, usage }            — 流结束，含完整累积内容
 *
 * @param {string} modelId
 * @param {Array} messages
 * @param {string} apiKey
 * @param {object} [options]
 */
async function* chatStream(modelId, messages, apiKey, options = {}) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`不支持的模型: ${modelId}`);

  const body = {
    model: modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...model.defaults,
    ...options,
  };

  console.log(
    `[LLM/stream] >>> ${model.label}` +
      `，消息数: ${messages.length}`
  );

  const res = await fetch(model.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errDetail = errText;
    try {
      const errJson = JSON.parse(errText);
      errDetail = errJson.error?.message || errJson.message || errText;
    } catch (_) {}
    throw new Error(`${model.label} 调用失败 (${res.status}): ${errDetail}`);
  }

  let accContent = "";
  let usage = null;
  let sseBuffer = "";

  for await (const rawChunk of res.body) {
    sseBuffer += rawChunk.toString("utf-8");
    // SSE 行以 \n 结束，每个事件以 \n\n 分隔；逐行处理，保留不完整的最后一行
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch (_) {
        continue;
      }

      if (chunk.usage) usage = chunk.usage;

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        accContent += delta.content;
        yield { type: "content_delta", chunk: delta.content };
      }
    }
  }

  console.log(
    `[LLM/stream] <<< ${model.label}` +
      (usage
        ? `，Token: 输入=${usage.prompt_tokens}, 输出=${usage.completion_tokens}`
        : "")
  );

  yield { type: "done", content: accContent, usage };
}

module.exports = { getModelInfo, chat, chatStream };
