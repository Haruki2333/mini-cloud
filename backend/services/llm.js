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
 * 获取所有可用模型列表
 */
function getModels() {
  return Object.entries(MODEL_REGISTRY).map(function ([id, info]) {
    return { id, provider: info.provider, label: info.label };
  });
}

/**
 * 获取单个模型信息
 */
function getModelInfo(modelId) {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * 通用大模型对话调用
 *
 * 智谱和千问均兼容 OpenAI Chat Completions API 格式，
 * 因此使用统一的请求结构。
 *
 * @param {string} modelId - 模型 ID（如 "glm-4.6v"）
 * @param {Array} messages - OpenAI 格式的 messages 数组
 * @param {string} apiKey - 对应厂商的 API Key
 * @param {object} [options] - 可选参数（max_tokens 等）
 * @returns {Promise<{content: string, usage: object|null}>}
 */
async function chat(modelId, messages, apiKey, options = {}) {
  const model = MODEL_REGISTRY[modelId];
  if (!model) {
    throw new Error(`不支持的模型: ${modelId}`);
  }

  // 当使用 function calling 时，关闭思考模式（部分模型不兼容）
  const defaults = { ...model.defaults };
  if (options.tools) {
    delete defaults.enable_thinking;
    delete defaults.thinking;
  }

  const body = {
    model: modelId,
    messages,
    ...defaults,
    ...options,
  };

  // 打印完整输入
  console.log(
    `[LLM] >>> 请求 ${model.label} (${modelId})\n` +
    `消息数: ${messages.length}` +
    (options.tools ? `，工具: ${options.tools.map((t) => t.function.name).join(", ")}` : "") +
    `\n输入消息:\n${JSON.stringify(messages, null, 2)}`
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
    console.error(`${model.label} API 错误 (${res.status}):`, errText);
    let errDetail = errText;
    try {
      const errJson = JSON.parse(errText);
      errDetail = errJson.error?.message || errJson.message || errText;
    } catch (_) {}
    throw new Error(`${model.label} 调用失败 (${res.status}): ${errDetail}`);
  }

  const data = await res.json();
  const message = data.choices && data.choices[0] && data.choices[0].message;
  const content = (message && message.content) || "";
  const tool_calls = (message && message.tool_calls) || null;

  // 打印完整输出
  console.log(
    `[LLM] <<< 响应 ${model.label} (${modelId})\n` +
    (data.usage
      ? `Token 用量: 输入=${data.usage.prompt_tokens}, 输出=${data.usage.completion_tokens}\n`
      : "") +
    `输出消息:\n${JSON.stringify(message, null, 2)}`
  );

  return { content, tool_calls, usage: data.usage || null };
}

module.exports = { MODEL_REGISTRY, getModels, getModelInfo, chat };
