# 财务助理 API

## POST /api/finance-chat/completions

财务助理 AI 对话接口，支持多轮对话，SSE 流式响应。内置 ReAct 推理循环，可自动调用 `record`、`query`、`update_profile`、`update_record`、`delete_record` 五个工具完成记账、查询、资料更新和记录管理。

### 请求头

| 名称 | 必填 | 说明 |
|------|------|------|
| X-Api-Key | 是 | 对应模型厂商的 API Key |
| Content-Type | 是 | application/json |
| X-Wx-OpenId | 二选一 | 微信小程序用户标识（由微信云托管注入） |
| X-Anon-Token | 二选一 | H5 Demo 匿名令牌（前端生成的 UUID） |

### 请求体

```json
{
  "messages": [
    { "role": "user", "content": "今天午饭花了35元" }
  ],
  "model": "qwen3.5-plus"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| messages | Array | 是 | OpenAI 格式的消息数组 |
| model | string | 否 | 模型 ID，默认 `qwen3.5-plus` |

> 用户资料（名称、分类、预算）由服务端根据请求头中的用户标识从数据库自动加载，无需在请求体中传入。

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
| update_record | 用户要求修改某条历史记录时（需先 query 获取 ID） |
| delete_record | 用户要求删除某条或多条记录时（需先 query 获取 ID） |

### 错误响应

```json
{ "error": "错误描述" }
```

| 状态码 | 说明 |
|--------|------|
| 400 | 参数错误（消息为空、不支持的模型） |
| 401 | 缺少 API Key，或缺少用户标识请求头 |
| 500 | LLM 调用失败 |

### 实现位置

- 路由：`backend/routes/finance.js`（`financeRouter`，挂载到 `/api/finance-chat`）
- 推理循环：`backend/services/core/brain.js`（`createBrain`）
- 工具实现：`backend/services/finance-assistant/skills.js`

---

## GET /api/finance-chat/data/summary

获取指定月份的财务摘要（总支出、总收入、净收支、分类汇总），供前端直接展示，不经过 LLM。

### 请求头

| 名称 | 必填 | 说明 |
|------|------|------|
| X-Wx-OpenId | 二选一 | 微信小程序用户标识 |
| X-Anon-Token | 二选一 | H5 Demo 匿名令牌 |

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| month | string | 否 | 月份 `YYYY-MM`，默认当月 |

### 响应

```json
{
  "success": true,
  "month": "2026-04",
  "expense": {
    "total": 3200.00,
    "byCategory": { "餐饮": 800.00, "交通": 400.00 }
  },
  "income": {
    "total": 10000.00
  },
  "netIncome": 6800.00
}
```

---

## GET /api/finance-chat/data/records

获取指定月份的财务记录明细，供前端直接展示，不经过 LLM。

### 请求头

同 `/data/summary`。

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| month | string | 否 | 月份 `YYYY-MM`，默认当月 |
| type | string | 否 | `expense` / `income` / `all`，默认 `all`（budget 记录不在此接口返回） |

### 响应

```json
{
  "success": true,
  "records": [
    {
      "id": 1,
      "amount": 35.00,
      "date": "2026-04-04",
      "createdAt": "2026-04-04T12:00:00.000Z",
      "category": "餐饮",
      "description": "午饭",
      "_kind": "expense"
    }
  ]
}
```

`_kind` 字段标识记录类型（`expense` 或 `income`）。

---

## GET /api/finance-chat/data/profile

获取当前用户的个人资料（名称、月预算、支出分类）。

### 请求头

同 `/data/summary`。

### 响应

```json
{
  "success": true,
  "name": "小明",
  "monthly_budget": 5000,
  "expense_categories": ["餐饮", "交通", "购物", "娱乐"]
}
```

---

## PUT /api/finance-chat/data/profile

更新当前用户的个人资料。与 `update_profile` 工具等效，供前端设置页直接调用。

### 请求头

同 `/data/summary`，另需 `Content-Type: application/json`。

### 请求体

```json
{
  "name": "小明",
  "monthly_budget": 5000,
  "expense_categories": ["餐饮", "交通", "购物", "娱乐"]
}
```

所有字段均为可选，仅传入需要修改的字段。`monthly_budget` 设为 `0` 表示清除预算。

### 响应

```json
{
  "success": true,
  "updates": { "name": "小明" },
  "message": "名称更新为\"小明\""
}
```

---

## PUT /api/finance-chat/data/records/:id

直接修改指定记录的字段，供前端详情页调用（与 `update_record` 工具等效）。

### 请求头

同 `/data/summary`，另需 `Content-Type: application/json`。

### 路径参数

| 参数 | 说明 |
|------|------|
| id | 记录 ID（整数） |

### 请求体

```json
{
  "amount": 40.00,
  "category": "餐饮",
  "description": "午饭（更正）",
  "date": "2026-04-04"
}
```

所有字段均为可选，仅传入需要修改的字段。支持 `amount`、`category`、`description`、`source`、`period`、`date`。

### 响应

```json
{
  "success": true,
  "message": "记录 #1 已更新",
  "updated": { "amount": 40.00, "description": "午饭（更正）" }
}
```

---

## DELETE /api/finance-chat/data/records/:id

直接删除指定记录，供前端详情页调用（与 `delete_record` 工具等效）。

### 请求头

同 `/data/summary`。

### 路径参数

| 参数 | 说明 |
|------|------|
| id | 记录 ID（整数） |

### 响应

```json
{
  "success": true,
  "deleted": [1],
  "notFound": [],
  "message": "已删除 1 条记录"
}
```

### 实现位置

路由：`backend/routes/finance.js`（`handleGetSummary`、`handleGetRecords`、`handleGetProfile`、`handlePutProfile`、`handlePutRecord`、`handleDeleteRecord`）
