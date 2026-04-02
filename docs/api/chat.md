# 财务助理对话接口

## POST /api/finance-chat/completions

财务助理 AI 对话接口，支持多轮对话，SSE 流式响应。内置 ReAct 推理循环，可自动调用 `record`、`query`、`update_profile` 三个工具完成记账、查询和资料更新。

### 请求头

| 名称 | 必填 | 说明 |
|------|------|------|
| X-Api-Key | 是 | 对应模型厂商的 API Key |
| Content-Type | 是 | application/json |

### 请求体

```json
{
  "messages": [
    { "role": "user", "content": "今天午饭花了35元" }
  ],
  "model": "qwen3.5-plus",
  "profile": {
    "name": "小明",
    "monthly_budget": 3000,
    "expenseCategories": ["餐饮", "交通", "购物", "娱乐", "其他"],
    "budgets": [
      { "category": "餐饮", "amount": 800, "period": "月" }
    ]
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | Array | 是 | OpenAI 格式的消息数组 |
| model | string | 否 | 模型 ID，默认 `qwen3.5-plus` |
| profile | object | 否 | 用户个人资料，注入 system prompt 并动态调整工具定义 |
| profile.name | string | 否 | 用户称呼 |
| profile.monthly_budget | number | 否 | 月预算金额（元） |
| profile.expenseCategories | string[] | 否 | 支出分类列表，传入后将替换工具中的默认分类枚举 |
| profile.budgets | object[] | 否 | 预算列表，每项含 `category`、`amount`、`period` |

### 响应（SSE 流式）

响应格式为 `text/event-stream`，每行格式为：

```
data: <JSON>\n\n
```

流结束时发送：

```
data: [DONE]\n\n
```

#### 事件类型

**thinking** — LLM 决定调用工具时推送，表示推理中间过程：

```json
{
  "type": "thinking",
  "iteration": 1,
  "maxIterations": 5,
  "content": "好的，我来帮你记录这笔支出。",
  "tool_calls": [
    { "name": "record", "arguments": "{\"records\":[{\"type\":\"expense\",\"amount\":35,\"category\":\"餐饮\",\"description\":\"午饭\"}]}" }
  ]
}
```

**tool_result** — 工具执行完成后推送：

```json
{
  "type": "tool_result",
  "name": "record",
  "arguments": "{\"records\":[...]}",
  "result": { "success": true, "results": [...] },
  "duration": 12
}
```

**answer** — 最终回复，推理循环结束时推送：

```json
{
  "type": "answer",
  "content": "已记录午饭支出 ¥35（餐饮）。"
}
```

**error** — 推理过程中出现异常（在 headers 已发送后）：

```json
{
  "type": "error",
  "message": "错误描述"
}
```

### 工具说明

| 工具名 | 触发场景 |
|--------|----------|
| record | 用户描述支出、收入或预算设置时 |
| query | 用户询问收支情况、明细统计时 |
| update_profile | 用户要求修改名字、月预算或支出分类时 |

### 错误响应

```json
{ "error": "错误描述" }
```

| 状态码 | 说明 |
|--------|------|
| 400 | 参数错误（消息为空、不支持的模型） |
| 401 | 缺少 API Key |
| 500 | LLM 调用失败 |

### 实现位置

- 路由：`backend/routes/chat.js`（`financeRouter`，挂载到 `/api/finance-chat`）
- 推理循环：`backend/services/brain.js`（`createBrain`）
- 工具实现：`backend/services/skills/finance-record.js`
