# LLM 服务层

通用大模型调用服务，与具体业务逻辑解耦。

## 概述

`backend/services/core/llm.js` 提供统一的大模型流式对话调用能力。当前支持 lingyaai（OpenAI 代理）、智谱、千问三家厂商，均兼容 OpenAI Chat Completions API 格式，服务层使用统一的 HTTP 请求结构，通过模型注册表区分端点。

## 模型注册表

| 模型 ID | 厂商 | 标签 | API 端点 |
|---------|------|------|----------|
| gpt-5.4 | lingyaai | OpenAI GPT-5.4 | `https://api.lingyaai.cn/v1/chat/completions` |
| glm-4.6v | zhipu | 智谱 GLM-4.6V | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| qwen3.5-plus | qwen | 千问 Qwen3.5-Plus | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |

认证方式统一为 `Authorization: Bearer <API_KEY>`。

`glm-4.6v` 和 `qwen3.5-plus` 默认开启思考模式（智谱用 `thinking: { type: "enabled" }`，千问用 `enable_thinking: true`）；`gpt-5.4` 无思考模式。启用 function calling（传入 `tools`）时自动关闭思考模式。

## 导出接口

### `chatStream(modelId, messages, apiKey, options)`

流式大模型对话调用，以 async generator 逐块 yield 事件。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| modelId | string | 是 | 模型 ID，须存在于 `MODEL_REGISTRY` |
| messages | Array | 是 | OpenAI Chat Completions 格式的消息数组 |
| apiKey | string | 是 | 对应厂商的 API Key |
| options | object | 否 | 可选参数，展开合并到请求体（如 `tools`） |

**Yield 事件**

| 类型 | 说明 |
|------|------|
| `{ type: "args_delta", index, name, chunk }` | 工具参数增量片段，供上层实时提取字段（如 narrative） |
| `{ type: "done", content, tool_calls, usage }` | 流结束，含完整累积结果 |

`done` 事件的字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 模型返回的文本内容 |
| tool_calls | Array \| null | 模型请求调用的工具列表（OpenAI 格式），无工具调用时为 `null` |
| usage | object \| null | token 用量信息（prompt_tokens / completion_tokens 等） |

**错误**

- 模型 ID 不在注册表中：抛出 `Error("不支持的模型: xxx")`
- 上游 API 返回非 2xx：抛出 `Error("xxx 调用失败 (状态码): 详情")`

---

### `getModelInfo(modelId)`

查询单个模型的完整注册信息。

**返回值**

模型存在时返回 `{ provider, label, endpoint, defaults }`，不存在时返回 `null`。

---

### `MODEL_REGISTRY`（内部）

模型注册表对象，key 为模型 ID，value 为 `{ provider, label, endpoint, defaults }`。其中 `defaults` 为模型默认参数（如思考模式开关），使用 function calling 时会自动关闭。仅供模块内部使用，不对外导出，外部请使用 `getModelInfo()`。

## 调用示例

### 纯文本对话

```js
const { chatStream } = require("../services/core/llm");

for await (const event of chatStream("qwen3.5-plus", [{ role: "user", content: "你好" }], apiKey)) {
  if (event.type === "done") {
    console.log(event.content);
  }
}
```

### 工具调用（function calling）

```js
const { chatStream } = require("../services/core/llm");

for await (const event of chatStream(
  "qwen3.5-plus",
  messages,
  apiKey,
  { tools: [...toolDefinitions] }
)) {
  if (event.type === "args_delta") {
    // 实时提取工具参数片段
  } else if (event.type === "done") {
    const { content, tool_calls, usage } = event;
  }
}
```

## 扩展新模型

在 `MODEL_REGISTRY` 中新增一条记录即可，前提是该模型的 API 兼容 OpenAI Chat Completions 格式：

```js
"new-model-id": {
  provider: "provider-name",
  label: "显示名称",
  endpoint: "https://api.example.com/v1/chat/completions",
},
```

同时需要更新本文档的模型注册表。

## 实现位置

`backend/services/core/llm.js`
