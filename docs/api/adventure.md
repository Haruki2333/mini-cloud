# 冒险游戏 API

## 概述

冒险游戏 API 提供 AI 驱动的互动冒险故事生成能力。通过 SSE 流式响应，前端实时接收故事内容、可选的灵感提示以及异步下发的背景图片。

**交互形态**：世界观初选为按钮式，进入故事后由玩家**自由文本输入**推动情节，AI 只负责呈现情境与演绎后果。文生图由路由层异步触发，不阻塞叙述返回。

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
    { "role": "user", "content": "我拔剑冲向哥布林" }
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
| `messages` | Array | 是 | 对话消息数组（user/assistant 交替）。世界观轮次后，user 消息为玩家自由文本 |
| `model` | String | 否 | 模型 ID，默认 `qwen3.5-plus` |
| `context` | Object | 否 | 故事上下文，包含 `worldSetting`（世界观）和 `choiceCount`（玩家已做行动次数） |

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

前端可从 `tool_calls[0].arguments` 提前解析出 `narrative` 字段，在工具真正执行前就先行渲染文字。

##### `tool_result` — 工具执行结果

```json
{
  "type": "tool_result",
  "name": "advance_story",
  "result": {
    "success": true,
    "narrative": "你站在一片古老的森林边缘...",
    "choices": [
      { "id": "hint1", "text": "查看地上的脚印" }
    ],
    "is_ending": false,
    "progress": 3,
    "title": "暗影森林的秘密",
    "image_prompt": "dark mystical forest at dusk, ..."
  },
  "duration": 120
}
```

注意：
- **`result.image_url` 已被移除**。背景图由独立的 `scene_image` 事件异步下发，见下。
- `result.image_prompt` 是 AI 为本场景填写的英文提示词，仅作前端判断是否显示"场景图生成中"角标。
- `result.choices` 语义见下文 `advance_story` 工具说明。

##### `scene_image_pending` — 图片生成已开始（新）

```json
{
  "type": "scene_image_pending",
  "turn_id": 3
}
```

路由层在 `tool_result` 产出且检测到 `image_prompt` 非空时立即下发，通知前端显示"场景图生成中…"角标。`turn_id` 是请求范围内单调递增的编号，用于与后续 `scene_image` / `scene_image_error` 配对。

##### `scene_image` — 图片生成成功（新）

```json
{
  "type": "scene_image",
  "turn_id": 3,
  "url": "https://bigmodel-..."
}
```

异步下发，前端收到后可直接设置为背景图；若 `turn_id` 与当前交互轮次不匹配，前端应忽略以避免旧图覆盖新场景。

##### `scene_image_error` — 图片生成失败（新）

```json
{
  "type": "scene_image_error",
  "turn_id": 3,
  "message": "图像生成失败"
}
```

文生图调用失败或返回空 URL 时下发，不影响主对话流继续进行。

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

> **事件顺序**：同一轮通常为 `thinking` → `tool_result` → `scene_image_pending`（若有图）→ `answer` → `scene_image` / `scene_image_error`（图片就绪后） → `[DONE]`。路由层会在 `brain.think` 循环结束后 `await Promise.allSettled` 所有在途图片任务，再关闭流。

## 工具说明

### `advance_story`

呈现当前故事情境的唯一工具。AI 每轮必须调用此工具。

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `narrative` | String | 是 | 故事叙述文本（中文，200-400 字） |
| `image_prompt` | String | 否 | 英文图片描述，**关键节点必须填写**（新场景、关键角色/怪物、高潮、结局、世界观首场景） |
| `choices` | Array | 否 | 见下文"语义"说明 |
| `is_ending` | Boolean | 否 | 是否为故事结局 |
| `progress` | Number | 是 | 故事进度（1-10） |
| `title` | String | 否 | 故事标题（世界观确定后的首个场景设置） |

**`choices` 字段语义（重要变化）：**

- **第一轮（世界观选择，progress=1）**：**必填 3 条**，`id` 用 `A/B/C`，作为按钮供玩家点击。
- **后续轮次**：**不是菜单**，而是"灵感提示"（0-2 条），`id` 用 `hint1/hint2`。玩家点击后**只会填入输入框**，不会自动提交，玩家仍以自由文本驱动故事。建议大多数情况下留空。
- **结局时（`is_ending=true`）**：不提供。

**返回值：** `{ success, narrative, choices, is_ending, progress, title, image_prompt }`。不再返回 `image_url`——背景图通过 `scene_image` 事件独立下发。
