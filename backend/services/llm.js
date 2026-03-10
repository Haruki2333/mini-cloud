const fetch = require("node-fetch");

// 模型注册表
const MODEL_REGISTRY = {
  "glm-4v-flash": {
    provider: "zhipu",
    label: "智谱 GLM-4V-Flash",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  },
  "glm-4v-flashx": {
    provider: "zhipu",
    label: "智谱 GLM-4V-FlashX",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  },
  "qwen3.5-flash": {
    provider: "qwen",
    label: "千问 Qwen3.5-Flash",
    endpoint:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
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
 * @param {string} modelId - 模型 ID（如 "glm-4v-flash"）
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

  const body = {
    model: modelId,
    messages,
    ...options,
  };

  const res = await fetch(model.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`${model.label} API 错误:`, res.status, err);
    throw new Error(`${model.label} 调用失败 (${res.status})`);
  }

  const data = await res.json();
  const content =
    (data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content) ||
    "";

  return { content, usage: data.usage || null };
}

module.exports = { MODEL_REGISTRY, getModels, getModelInfo, chat };
