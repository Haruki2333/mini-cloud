# 对话接口

## POST /api/chat/completions

通用 AI 对话接口，支持多轮对话，可注入用户个人资料实现个性化回复。

### 请求头

| 名称 | 必填 | 说明 |
|------|------|------|
| X-Api-Key | 是 | 对应模型厂商的 API Key |
| Content-Type | 是 | application/json |

### 请求体

```json
{
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好！有什么可以帮你的？" },
    { "role": "user", "content": "今天天气怎么样？" }
  ],
  "model": "qwen3.5-plus",
  "profile": {
    "name": "小明",
    "age": "25",
    "gender": "男",
    "hobbies": "阅读、跑步",
    "bio": "一个喜欢户外运动的程序员"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | Array | 是 | OpenAI 格式的消息数组 |
| model | string | 否 | 模型 ID，默认 `qwen3.5-plus` |
| profile | object | 否 | 用户个人资料，注入 system prompt |

### 响应

```json
{
  "content": "AI 回复文本",
  "model": "qwen3.5-plus"
}
```

### 错误响应

```json
{
  "error": "错误描述"
}
```

| 状态码 | 说明 |
|--------|------|
| 400 | 参数错误（消息为空、不支持的模型） |
| 401 | 缺少 API Key |
| 500 | LLM 调用失败 |
