# 扑克教练 API 文档

挂载路径：`/api/poker`

---

## SSE 对话接口

### POST /api/poker/completions

德州扑克教练 AI 对话（SSE 流式）。支持：
- 分析具体手牌（LLM 调用 `get_hand_detail` → `save_analysis`）
- 追问跟进（普通对话，LLM 凭聊天上下文回答）
- Leak 识别（LLM 调用 `get_user_analyses` → `save_leaks`）

**请求头**

| 字段             | 说明                                      |
|------------------|-------------------------------------------|
| `X-Api-Key`      | LLM API Key（必填）                       |
| `X-Anon-Token`   | 前端生成的 UUID 匿名令牌（必填）          |
| `Content-Type`   | `application/json`                        |

**请求体**

```json
{
  "messages": [
    { "role": "user", "content": "请分析手牌 #1，找出关键决策点" }
  ],
  "model": "qwen3.5-plus"
}
```

| 字段       | 类型     | 必填 | 说明                                       |
|------------|----------|------|--------------------------------------------|
| `messages` | array    | 是   | 对话历史，OpenAI 格式                      |
| `model`    | string   | 否   | 模型 ID，默认 `qwen3.5-plus`              |

**SSE 事件格式**

```
data: {"type":"thinking","iteration":1,"content":"...","tool_calls":[...]}
data: {"type":"tool_result","name":"get_hand_detail","arguments":{...},"result":{...},"duration":150}
data: {"type":"answer","content":"这手牌的翻前 3bet 是正确的，但转牌的弃牌..."}
data: [DONE]
```

---

## 手牌管理

### POST /api/poker/hands

录入新手牌。不调用 LLM，直接入库。

**请求头**：同上（`X-Anon-Token` 必填，`X-Api-Key` 非必填）

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
| `table_type`          | string   | 是   | `6max` / `9max` / `hu`         |
| `hero_position`       | string   | 是   | 位置，如 `BTN`, `BB`, `CO`     |
| `hero_cards`          | string   | 是   | 起手牌，如 `AsKd`              |
| `preflop_actions`     | string   | 是   | 翻前行动文字描述                |
| `effective_stack_bb`  | number   | 否   | 有效筹码（BB 数）               |
| `opponent_notes`      | string   | 否   | 对手备注                        |
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

| 工具名              | 说明                               |
|---------------------|------------------------------------|
| `get_hand_detail`   | 获取指定手牌的完整信息及已有分析   |
| `save_analysis`     | 保存决策点分析结果（1-2 个/手）    |
| `get_user_analyses` | 获取用户历史分析，用于 Leak 识别   |
| `save_leaks`        | 保存识别出的 Leak 模式             |
