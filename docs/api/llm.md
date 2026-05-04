# LLM 服务层

通用大模型调用服务，与具体业务逻辑解耦。

## 概述

`backend/services/core/llm.js` 提供统一的大模型调用能力（流式与非流式）。当前仅接入 lingyaai（OpenAI 代理），兼容 OpenAI Chat Completions API 格式，通过模型注册表登记端点。

## 模型注册表

所有模型均通过 lingyaai 统一代理端点 `https://api.lingyaai.cn/v1/chat/completions` 调用，认证方式统一为 `Authorization: Bearer <API_KEY>`。

| 模型 ID | 厂商 | 标签 |
|---------|------|------|
| `gpt-5.4` | openai | OpenAI GPT-5.4 |
| `claude-sonnet-4-6-thinking` | anthropic | Claude Sonnet 4.6 Thinking |
| `gemini-3.1-pro-preview-thinking` | google | Gemini 3.1 Pro Preview Thinking |
| `deepseek-v4-pro` | deepseek | DeepSeek V4 Pro |
| `doubao-seed-2-0-pro` | volcengine | Doubao Seed 2.0 Pro |
| `kimi-k2.6` | moonshot | Kimi K2.6 |

新增模型时需同步更新 `MODEL_REGISTRY`（`backend/services/core/llm.js`）和价格表（`backend/services/core/pricing.js`），并在本表补充一行。

## 导出接口

### `chatStream(modelId, messages, apiKey, options)`

流式大模型对话调用，以 async generator 逐块 yield 事件。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| modelId | string | 是 | 模型 ID，须存在于 `MODEL_REGISTRY` |
| messages | Array | 是 | OpenAI Chat Completions 格式的消息数组 |
| apiKey | string | 是 | 对应厂商的 API Key |
| options | object | 否 | 可选参数，展开合并到请求体 |

**Yield 事件**

| 类型 | 说明 |
|------|------|
| `{ type: "content_delta", chunk }` | 文本增量片段 |
| `{ type: "done", content, usage }` | 流结束，含完整累积文本与 token 用量 |

`done` 事件的字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 模型返回的完整文本内容 |
| usage | object \| null | token 用量信息（prompt_tokens / completion_tokens 等） |

**错误**

- 模型 ID 不在注册表中：抛出 `Error("不支持的模型: xxx")`
- 上游 API 返回非 2xx：抛出 `Error("xxx 调用失败 (状态码): 详情")`

---

### `chat(modelId, messages, apiKey, options)`

非流式大模型对话调用，结果一次性返回。适用于需要 JSON 模板输出并在后端校验落库的场景。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| modelId | string | 是 | 模型 ID，须存在于 `MODEL_REGISTRY` |
| messages | Array | 是 | OpenAI Chat Completions 格式的消息数组 |
| apiKey | string | 是 | 对应厂商的 API Key |
| options | object | 否 | 可选参数，透传给上游 API（如 `response_format`、`timeout`） |

**返回值**

`Promise<{ content: string, usage: object|null }>`

**错误**：同 `chatStream`。

---

### `getModelInfo(modelId)`

查询单个模型的完整注册信息。

**返回值**

模型存在时返回 `{ provider, label, endpoint, defaults }`，不存在时返回 `null`。

---

### `MODEL_REGISTRY`（内部）

模型注册表对象，key 为模型 ID，value 为 `{ provider, label, endpoint, defaults }`。仅供模块内部使用，不对外导出，外部请使用 `getModelInfo()`。

## 调用示例

### 流式文本对话

```js
const { chatStream } = require("../services/core/llm");

for await (const event of chatStream("gpt-5.4", [{ role: "user", content: "你好" }], apiKey)) {
  if (event.type === "content_delta") {
    process.stdout.write(event.chunk);
  } else if (event.type === "done") {
    console.log("完整内容:", event.content);
  }
}
```

### 非流式调用（JSON 输出）

```js
const { chat } = require("../services/core/llm");

const { content, usage } = await chat(
  "gpt-5.4",
  messages,
  apiKey,
  { response_format: { type: "json_object" } }
);
const result = JSON.parse(content);
```

## 扩展新模型

在 `MODEL_REGISTRY` 中新增一条记录即可，前提是该模型的 API 兼容 OpenAI Chat Completions 格式：

```js
"new-model-id": {
  provider: "provider-name",
  label: "显示名称",
  endpoint: "https://api.lingyaai.cn/v1/chat/completions",
  defaults: {},
},
```

同时需要：1）在 `pricing.js` 的 `PRICING` 表中补充该模型的费率；2）更新本文档的模型注册表。

## 实现位置

`backend/services/core/llm.js`
