# LLM 服务层

通用大模型调用服务，与具体业务逻辑解耦。

## 概述

`backend/services/llm.js` 提供统一的大模型对话调用能力。当前支持智谱和千问两家厂商，两者均兼容 OpenAI Chat Completions API 格式，因此服务层使用统一的 HTTP 请求结构，通过模型注册表区分端点。

## 模型注册表

| 模型 ID | 厂商 | 标签 | API 端点 |
|---------|------|------|----------|
| glm-4.6v | zhipu | 智谱 GLM-4.6V | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| qwen3.5-plus | qwen | 千问 Qwen3.5-Plus | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |

认证方式统一为 `Authorization: Bearer <API_KEY>`。

## 导出接口

### `chat(modelId, messages, apiKey, options)`

核心调用函数，向指定模型发送对话请求。

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| modelId | string | 是 | 模型 ID，须存在于 `MODEL_REGISTRY` |
| messages | Array | 是 | OpenAI Chat Completions 格式的消息数组 |
| apiKey | string | 是 | 对应厂商的 API Key |
| options | object | 否 | 可选参数，会展开合并到请求体（如 `max_tokens`、`temperature`） |

**返回值**

```js
{ content: string, tool_calls: Array | null, usage: object | null }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 模型返回的文本内容 |
| tool_calls | Array \| null | 模型请求调用的工具列表（OpenAI 格式），无工具调用时为 `null` |
| usage | object \| null | token 用量信息（由厂商返回，格式各异） |

**错误**

- 模型 ID 不在注册表中：抛出 `Error("不支持的模型: xxx")`
- 上游 API 返回非 2xx：抛出 `Error("xxx 调用失败 (状态码)")`

---

### `getModels()`

返回所有可用模型的精简列表，适合暴露给前端。

**返回值**

```js
[
  { id: "glm-4.6v", provider: "zhipu", label: "智谱 GLM-4.6V" },
  ...
]
```

---

### `getModelInfo(modelId)`

查询单个模型的完整注册信息。

**返回值**

模型存在时返回 `{ provider, label, endpoint, defaults }`，不存在时返回 `null`。

---

### `MODEL_REGISTRY`（内部）

模型注册表对象，key 为模型 ID，value 为 `{ provider, label, endpoint, defaults }`。其中 `defaults` 为模型默认参数（如思考模式开关），使用 function calling 时会自动关闭。仅供模块内部使用，不对外导出，外部请使用 `getModelInfo()` / `getModels()`。

## 调用示例

### 纯文本对话

```js
const { chat } = require("../services/llm");

const result = await chat(
  "qwen3.5-plus",
  [{ role: "user", content: "你好" }],
  apiKey
);
console.log(result.content);
```

### 视觉（图片）对话

```js
const { chat } = require("../services/llm");

const result = await chat(
  "glm-4.6v",
  [
    {
      role: "user",
      content: [
        { type: "text", text: "请描述这张图片" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } },
      ],
    },
  ],
  apiKey
);
console.log(result.content);
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

同时需要：
1. 更新前端 `backend/demo/finance-assistant/js/types.js` 中的 `MODEL_CONFIG`（如果存在）
2. 更新本文档的模型注册表

## 实现位置

`backend/services/llm.js`
