# LLM 服务层

通用大模型调用服务，与具体业务逻辑解耦。

## 概述

`backend/services/llm.js` 提供统一的大模型对话调用能力。当前支持智谱和千问两家厂商，两者均兼容 OpenAI Chat Completions API 格式，因此服务层使用统一的 HTTP 请求结构，通过模型注册表区分端点。

## 模型注册表

| 模型 ID | 厂商 | 标签 | API 端点 |
|---------|------|------|----------|
| glm-4.6v-flash | zhipu | 智谱 GLM-4.6V-Flash | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| glm-4.6v-flashx | zhipu | 智谱 GLM-4.6V-FlashX | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| qwen3.5-flash | qwen | 千问 Qwen3.5-Flash | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` |

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
{ content: string, usage: object | null }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 模型返回的文本内容 |
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
  { id: "glm-4.6v-flash", provider: "zhipu", label: "智谱 GLM-4.6V-Flash" },
  ...
]
```

---

### `getModelInfo(modelId)`

查询单个模型的完整注册信息。

**返回值**

模型存在时返回 `{ provider, label, endpoint }`，不存在时返回 `null`。

---

### `MODEL_REGISTRY`

模型注册表对象，key 为模型 ID，value 为 `{ provider, label, endpoint }`。一般不建议外部直接操作，优先使用上述函数。

## 调用示例

### 纯文本对话

```js
const { chat } = require("../services/llm");

const result = await chat(
  "qwen3.5-flash",
  [{ role: "user", content: "你好" }],
  apiKey
);
console.log(result.content);
```

### 视觉（图片）对话

```js
const { chat } = require("../services/llm");

const result = await chat(
  "glm-4.6v-flash",
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
1. 更新前端 `backend/demo/food-tracker/js/types.js` 中的 `MODEL_CONFIG`
2. 更新前端 `backend/demo/food-tracker/settings.html` 添加新厂商的 API Key 输入（如果是新厂商）
3. 更新本文档的模型注册表

## 实现位置

`backend/services/llm.js`
