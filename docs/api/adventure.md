# 冒险游戏 API

## 概述

冒险游戏 API 提供 AI 驱动的互动冒险故事生成能力。通过 SSE 流式响应，前端实时接收故事内容、选项和背景图片。

## 端点

### POST `/api/adventure/completions`

AI 冒险故事对话（SSE 流式）。

#### 请求头

| 字段 | 必填 | 说明 |
|------|------|------|
| `Content-Type` | 是 | `application/json` |
| `X-Api-Key` | 是 | LLM 厂商 API Key（同时用于文生图） |
| `X-Image-Api-Key` | 否 | 文生图专用 API Key（不传则复用 X-Api-Key） |

#### 请求体

```json
{
  "messages": [
    { "role": "user", "content": "开始一个新的冒险故事" }
  ],
  "model": "qwen3.5-plus",
  "context": {
    "worldSetting": "奇幻王国",
    "choiceCount": 3
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | Array | 是 | 对话消息数组（user/assistant 交替） |
| `model` | String | 否 | 模型 ID，默认 `qwen3.5-plus` |
| `context` | Object | 否 | 故事上下文，包含 `worldSetting`（世界观）和 `choiceCount`（已做选择数） |

#### SSE 响应事件

##### `thinking` — AI 推理中

```json
{
  "type": "thinking",
  "iteration": 1,
  "maxIterations": 5,
  "content": "",
  "tool_calls": [
    { "name": "advance_story", "arguments": "{...}" }
  ]
}
```

##### `tool_result` — 工具执行结果

```json
{
  "type": "tool_result",
  "name": "advance_story",
  "result": {
    "success": true,
    "narrative": "你站在一片古老的森林边缘...",
    "choices": [
      { "id": "A", "text": "踏入森林深处" },
      { "id": "B", "text": "沿着小径前行" }
    ],
    "is_ending": false,
    "progress": 3,
    "title": "暗影森林的秘密",
    "image_url": "https://..."
  },
  "duration": 5200
}
```

##### `answer` — 最终回复

```json
{
  "type": "answer",
  "content": "故事已推进"
}
```

##### `error` — 错误

```json
{
  "type": "error",
  "message": "错误描述"
}
```

流结束标记：`data: [DONE]\n\n`

## 工具说明

### `advance_story`

推进冒险故事的唯一工具。AI 每轮必须调用此工具。

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `narrative` | String | 是 | 故事叙述文本 |
| `image_prompt` | String | 否 | 英文图片描述，触发文生图生成背景 |
| `choices` | Array | 否 | 选项数组 `[{id, text}]`，结局时不提供 |
| `is_ending` | Boolean | 否 | 是否为故事结局 |
| `progress` | Number | 是 | 故事进度（1-10） |
| `title` | String | 否 | 故事标题（首次设定时传入） |

**返回值：** 原参数 + `image_url`（文生图结果 URL，无图片时为 null）。
