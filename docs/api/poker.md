# 扑克教练 API 文档

挂载路径：`/api/poker`

---

## SSE 对话接口

### POST /api/poker/completions

德州扑克教练 AI 对话（SSE 流式）。支持：
- 分析具体手牌（路由层预取手牌数据并注入上下文，LLM 分析后调用 `save_analysis` 保存）
- 追问跟进（普通对话，LLM 凭聊天上下文回答）
- Leak 识别（路由层预取历史分析并注入上下文，LLM 识别后调用 `save_leaks` 保存）

**请求头**

| 字段             | 说明                                                              |
|------------------|-------------------------------------------------------------------|
| `X-Api-Key`      | LLM API Key（必填）                                               |
| `X-Anon-Token`   | 前端生成的 UUID 匿名令牌（H5 Demo 用，与 `X-Wx-OpenId` 二选一）  |
| `X-Wx-OpenId`    | 微信小程序用户标识（小程序用，由微信云托管自动注入）              |
| `Content-Type`   | `application/json`                                                |

**请求体**

```json
{
  "messages": [
    { "role": "user", "content": "请分析手牌 #1，找出关键决策点" }
  ],
  "model": "gpt-5.4",
  "hand_id": 1
}
```

| 字段             | 类型     | 必填 | 说明                                                       |
|------------------|----------|------|------------------------------------------------------------|
| `messages`       | array    | 是   | 对话历史，OpenAI 格式                                      |
| `model`          | string   | 否   | 模型 ID，默认 `gpt-5.4`                                   |
| `hand_id`        | number   | 否   | 手牌 ID；指定后进入手牌分析模式，路由层预取手牌数据注入上下文 |
| `analyze_leaks`  | boolean  | 否   | 为 `true` 时进入 Leak 专项分析模式，路由层预取历史分析注入上下文 |

**SSE 事件格式**

```
data: {"type":"thinking","iteration":1,"content":"...","tool_calls":[{"name":"save_analysis","arguments":"..."}]}
data: {"type":"tool_result","name":"save_analysis","arguments":{...},"result":{"success":true,"saved_count":2},"duration":80}
data: {"type":"answer","content":"这手牌的翻前 3bet 是正确的，但转牌的弃牌..."}
data: [DONE]
```

---

## 手牌管理

### POST /api/poker/hands

录入新手牌。不调用 LLM，直接入库。

**请求头**：`X-Anon-Token` 或 `X-Wx-OpenId`（二选一，必填）；`X-Api-Key` 非必填

**请求体**

```json
{
  "blind_level": "1/2",
  "table_type": "6max",
  "hero_position": "BTN",
  "hero_cards": "AsKd",
  "effective_stack_bb": 100,
  "opponent_notes": "BB 是 reg，倾向防御",
  "preflop_actions": "UTG fold, CO fold, BTN (Hero) raise 3BB, SB fold, BB call",
  "flop_cards": "Ah 7h 2c",
  "flop_actions": "BB check, BTN bet 5BB, BB call",
  "turn_card": "Kd",
  "turn_actions": "BB check, BTN bet 12BB, BB raise 36BB, BTN call",
  "river_card": "5h",
  "river_actions": "BB bet 50BB, BTN fold",
  "result_bb": -50,
  "showdown_opp_cards": null,
  "notes": "转牌被 raise 后感觉被 value 了，但还是跟了",
  "played_at": "2024-01-15"
}
```

| 字段                  | 类型     | 必填 | 说明                            |
|-----------------------|----------|------|---------------------------------|
| `blind_level`         | string   | 是   | 盲注级别，如 `1/2`             |
| `table_type`          | string   | 否   | `6max` / `9max` / `hu`，默认 `6max` |
| `hero_position`       | string   | 是   | 位置，如 `BTN`, `BB`, `CO`     |
| `hero_cards`          | string   | 是   | 起手牌，如 `AsKd`              |
| `preflop_actions`     | string   | 是*  | 翻前行动文字描述（传入 `actions` 时可自动生成） |
| `effective_stack_bb`  | number   | 否   | 有效筹码（BB 数）               |
| `opponent_notes`      | string   | 否   | 对手备注（传入 `opponents` 时可自动生成） |
| `flop_cards`          | string   | 否   | 翻牌，如 `Ah 7h 2c`           |
| `flop_actions`        | string   | 否   | 翻牌行动                        |
| `turn_card`           | string   | 否   | 转牌，如 `Kd`                  |
| `turn_actions`        | string   | 否   | 转牌行动                        |
| `river_card`          | string   | 否   | 河牌，如 `5h`                  |
| `river_actions`       | string   | 否   | 河牌行动                        |
| `result_bb`           | number   | 否   | 结果（BB，正赢负输）            |
| `showdown_opp_cards`  | string   | 否   | 摊牌对手底牌                    |
| `notes`               | string   | 否   | 备注                            |
| `played_at`           | string   | 否   | 日期 `YYYY-MM-DD`              |
| `actions`             | object   | 否   | 结构化行动（可替代文字描述）：`{ preflop: [{position, action, amount?}], flop?, turn?, river? }` |
| `opponents`           | array    | 否   | 对手信息（可替代 opponent_notes）：`[{position, stack_bb?}]` |

**响应**

```json
{ "hand_id": 42 }
```

---

### GET /api/poker/hands

列出用户所有手牌（最多 50 条，按录入时间倒序）。

**响应**

```json
{
  "total": 15,
  "hands": [
    {
      "id": 42,
      "blind_level": "1/2",
      "table_type": "6max",
      "hero_position": "BTN",
      "hero_cards": "AsKd",
      "result_bb": -50,
      "played_at": "2024-01-15",
      "is_analyzed": true,
      "created_at": "2024-01-16T10:23:00.000Z"
    }
  ]
}
```

---

### DELETE /api/poker/hands/:id

删除指定手牌及其所有关联数据（分析记录、评估批次及评估结果）。

**响应**

```json
{ "success": true }
```

---

### GET /api/poker/hands/:id

获取单个手牌完整数据及其所有分析结果。

**响应**

```json
{
  "id": 42,
  "blind_level": "1/2",
  "hero_position": "BTN",
  "hero_cards": "AsKd",
  "preflop_actions": "...",
  "flop_cards": "Ah 7h 2c",
  "is_analyzed": true,
  "analyses": [
    {
      "id": 1,
      "hand_id": 42,
      "street": "turn",
      "scenario": "Hero BTN，持 AsKd，转牌 Kd 后面对 BB 的超大 check-raise...",
      "rating": "problematic",
      "hero_action": "跟注",
      "better_action": "应弃牌，BB 的 check-raise range 极为强势",
      "reasoning": "BB 在这个牌面上 check-call flop 然后 turn check-raise，...",
      "principle": "面对 check-raise 时，要评估对手在此牌面上 check-call 之后还会 raise 的牌型范围..."
    }
  ]
}
```

---

## Leak 分析

### GET /api/poker/leaks

获取该用户已保存的 Leak 模式列表。

**响应**

```json
{
  "total_hands": 18,
  "leaks": [
    {
      "id": 1,
      "user_id": 5,
      "pattern": "在 3bet pot 中，转牌面对 check-raise 时频繁跟注而不是弃牌，出现 4 次",
      "occurrences": 4,
      "example_hand_ids": [42, 38, 31, 25]
    }
  ]
}
```

---

## LLM 工具（供 Agent 调用）

手牌数据和历史分析均由路由层在请求入口预取并注入 LLM 上下文，Agent 无需主动获取数据，只需在分析完成后调用写入工具。

| 工具名          | 说明                                                      |
|-----------------|-----------------------------------------------------------|
| `save_analysis` | 保存决策点分析结果（每手 1-2 个），可附带 `leaks` 数组一并保存 |
| `save_leaks`    | 保存识别出的 Leak 模式（Leak 专项分析模式使用）            |

---

## 大模型横向评估

### POST /api/poker/eval/runs

触发多模型并发评估（SSE 流式）。评估调用走 lingyaai 统一代理，不影响主对话路径。

**请求头**：`X-Api-Key`（lingyaai key，必填）、`X-Anon-Token` / `X-Wx-OpenId`（必填）

**请求体**

```json
{
  "hand_id": 42,
  "model_ids": ["gpt-5.4", "deepseek-v4-pro"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hand_id` | number | 是 | 手牌 ID |
| `model_ids` | array | 否 | 指定模型子集；省略则用全部 6 款 |

**SSE 事件序列**

```
data: {"type":"eval_started","eval_run_id":7,"hand_id":42,"models":[...]}
data: {"type":"eval_model_started","eval_run_id":7,"model_id":"gpt-5.4"}
data: {"type":"eval_model_done","eval_run_id":7,"model_id":"gpt-5.4","result":{"status":"success","latency_ms":3420,"prompt_tokens":1205,"completion_tokens":680,"cost_usd":0.009814,"schema_valid":true,"structured_output":[...]}}
data: {"type":"eval_judge_done","eval_run_id":7,"judge_model_id":"claude-sonnet-4-6-thinking","scores":[{"model_id":"gpt-5.4","score":4,"notes":"..."}]}
data: {"type":"eval_completed","eval_run_id":7,"consistency_score":66.7,"total_cost_usd":0.042318,"status":"completed"}
data: [DONE]
```

---

### GET /api/poker/eval/runs?hand_id=:id

列出某手牌的所有历史评估批次。

**响应**

```json
{ "runs": [{ "id": 7, "status": "completed", "consistency_score": 66.7, "total_cost_usd": 0.042318, "requested_models": ["gpt-5.4", "..."], "created_at": "..." }] }
```

---

### GET /api/poker/eval/runs/:id

获取单个评估批次详情，含所有模型结果。

**响应**

```json
{
  "id": 7, "hand_id": 42, "status": "completed",
  "consistency_score": 66.7, "total_cost_usd": 0.042318,
  "results": [
    { "model_id": "gpt-5.4", "status": "success", "latency_ms": 3420,
      "prompt_tokens": 1205, "completion_tokens": 680, "cost_usd": 0.009814,
      "schema_valid": true, "structured_output": [],
      "judge_score": 4, "judge_notes": "..." }
  ]
}
```
