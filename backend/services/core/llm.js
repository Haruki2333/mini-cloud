const fetch = require("node-fetch");

// 模型注册表
const MODEL_REGISTRY = {
  "glm-4.6v": {
    provider: "zhipu",
    label: "智谱 GLM-4.6V",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    // 默认开启思考模式
    defaults: { thinking: { type: "enabled" } },
  },
  "qwen3.5-plus": {
    provider: "qwen",
    label: "千问 Qwen3.5-Plus",
    endpoint:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    // 默认开启思考模式
    defaults: { enable_thinking: true },
  },
};

/**
 * 从 usage 对象中提取缓存命中信息
 * - 千问：usage.prompt_tokens_details.cached_tokens
 * - 智谱：usage.prompt_cache_hit_tokens
 */
function getCacheInfo(usage) {
  if (!usage || !usage.prompt_tokens) return null;
  const cached =
    usage.prompt_tokens_details?.cached_tokens ??
    usage.prompt_cache_hit_tokens ??
    null;
  if (cached == null) return null;
  const rate = ((cached / usage.prompt_tokens) * 100).toFixed(1);
  return { cached, rate };
}

/**
 * 获取单个模型信息
 */
function getModelInfo(modelId) {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * 流式大模型对话调用（stream: true）
 *
 * 以 async generator 逐块 yield 事件：
 *   - { type: "args_delta", index, name, chunk }  — 工具参数增量片段
 *   - { type: "done", content, tool_calls, usage }  — 流结束，含完整累积结果
 *
 * @param {string} modelId
 * @param {Array} messages
 * @param {string} apiKey
 * @param {object} [options]
 */
async function* chatStream(modelId, messages, apiKey, options = {}) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) throw new Error(`不支持的模型: ${modelId}`);

  const defaults = { ...model.defaults };
  if (options.tools) {
    delete defaults.enable_thinking;
    delete defaults.thinking;
  }

  const body = {
    model: modelId,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...defaults,
    ...options,
  };

  console.log(
    `[LLM/stream] >>> ${model.label}` +
      `，消息数: ${messages.length}` +
      (options.tools
        ? `，工具: ${options.tools.map((t) => t.function.name).join(", ")}`
        : "")
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

  // 累积完整响应，用于在 done 事件中返回
  let accContent = "";
  const accToolCallsMap = {}; // index -> { id, name, arguments }
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
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!accToolCallsMap[idx]) {
            accToolCallsMap[idx] = { id: "", name: "", arguments: "" };
          }
          if (tc.id) accToolCallsMap[idx].id = tc.id;
          if (tc.function?.name) accToolCallsMap[idx].name = tc.function.name;
          if (tc.function?.arguments) {
            accToolCallsMap[idx].arguments += tc.function.arguments;
            yield {
              type: "args_delta",
              index: idx,
              name: accToolCallsMap[idx].name,
              chunk: tc.function.arguments,
            };
          }
        }
      }
    }
  }

  const toolCallsArr = Object.values(accToolCallsMap);
  const tool_calls =
    toolCallsArr.length > 0
      ? toolCallsArr.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }))
      : null;

  console.log(
    `[LLM/stream] <<< ${model.label}` +
      (usage
        ? `，Token: 输入=${usage.prompt_tokens}, 输出=${usage.completion_tokens}`
        : "") +
      (tool_calls
        ? `，工具: ${tool_calls.map((t) => t.function.name).join(", ")}`
        : "")
  );

  yield { type: "done", content: accContent, tool_calls, usage };
}

module.exports = { getModelInfo, chatStream };
