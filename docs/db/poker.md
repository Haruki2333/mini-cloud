# 扑克教练 — 数据库表结构

## poker_users

用户表，与匿名令牌绑定。

| 字段         | 类型             | 说明                          |
|--------------|------------------|-------------------------------|
| `id`         | INT UNSIGNED PK  | 自增主键                      |
| `anon_token` | VARCHAR(128) UQ  | 前端生成的 UUID 匿名令牌      |
| `created_at` | DATETIME         | 创建时间                      |
| `updated_at` | DATETIME         | 更新时间                      |

---

## poker_hands

手牌记录，每行对应用户通过结构化表单录入的一手牌。

| 字段                  | 类型              | 说明                                    |
|-----------------------|-------------------|-----------------------------------------|
| `id`                  | INT UNSIGNED PK   | 自增主键                                |
| `user_id`             | INT UNSIGNED      | 所属用户 ID（FK → poker_users.id）      |
| `blind_level`         | VARCHAR(20)       | 盲注级别，如 `1/2`、`5/10`             |
| `table_type`          | ENUM              | `6max` / `9max` / `hu`                 |
| `hero_position`       | VARCHAR(10)       | Hero 位置，如 `BTN`、`BB`、`CO`        |
| `hero_cards`          | VARCHAR(20)       | Hero 起手牌，如 `AsKd`                 |
| `effective_stack_bb`  | DECIMAL(8,2)      | 有效筹码（BB 数，可为空）               |
| `opponent_notes`      | VARCHAR(200)      | 对手信息备注（可选）                    |
| `preflop_actions`     | TEXT              | 翻前行动文字描述                        |
| `flop_cards`          | VARCHAR(20)       | 翻牌公共牌，如 `Ah 7h 2c`（可为空）    |
| `flop_actions`        | TEXT              | 翻牌行动描述（可为空）                  |
| `turn_card`           | VARCHAR(5)        | 转牌，如 `Kd`（可为空）                |
| `turn_actions`        | TEXT              | 转牌行动描述（可为空）                  |
| `river_card`          | VARCHAR(5)        | 河牌，如 `5h`（可为空）                |
| `river_actions`       | TEXT              | 河牌行动描述（可为空）                  |
| `result_bb`           | DECIMAL(8,2)      | 结果（BB，正赢负输，可为空）            |
| `showdown_opp_cards`  | VARCHAR(20)       | 摊牌时对手底牌（可选）                  |
| `notes`               | TEXT              | 用户备注（可选）                        |
| `played_at`           | DATE              | 牌局日期（可为空）                      |
| `opponents`           | JSON              | 对手信息 `[{position, stack_bb}]`（可为空） |
| `actions`             | JSON              | 结构化行动 `{preflop: [{position, action, amount?}], ...}`（可为空） |
| `is_analyzed`         | BOOLEAN           | 是否已完成 AI 分析，默认 false          |
| `analysis_model_id`         | VARCHAR(64)   | 本次分析所用模型 ID（分析落库时写入，可空） |
| `analysis_prompt_tokens`    | INT UNSIGNED  | 本次分析累计输入 token 数（可空）       |
| `analysis_completion_tokens`| INT UNSIGNED  | 本次分析累计输出 token 数（可空）       |
| `analysis_cost_usd`         | DECIMAL(10,6) | 本次分析累计成本（与 pricing.js 单位一致，可空） |
| `created_at`          | DATETIME          | 创建时间                                |
| `updated_at`          | DATETIME          | 更新时间                                |

**索引**：`idx_poker_hands_user_time (user_id, created_at)`

---

## poker_analyses

决策点分析结果。每手牌最多 1-2 条，由后端解析 LLM 返回的 JSON 后直接落库。

| 字段            | 类型              | 说明                                              |
|-----------------|-------------------|---------------------------------------------------|
| `id`            | INT UNSIGNED PK   | 自增主键                                          |
| `hand_id`       | INT UNSIGNED      | 所属手牌 ID（FK → poker_hands.id）                |
| `street`        | ENUM              | 决策点所在街：`preflop`/`flop`/`turn`/`river`    |
| `scenario`      | TEXT              | 场景复述（位置、底池、行动）                      |
| `rating`        | ENUM              | 评级：`good`/`acceptable`/`problematic`           |
| `hero_action`   | VARCHAR(100)      | Hero 的实际操作                                   |
| `better_action` | TEXT              | 更优选择描述（rating 为 good 时可为空）           |
| `reasoning`     | TEXT              | 推理解释（教练口吻，100-200 字）                  |
| `principle`     | TEXT              | 背后的通用德扑原则（30-60 字）                    |
| `created_at`    | DATETIME          | 创建时间                                          |
| `updated_at`    | DATETIME          | 更新时间（重新分析时会刷新，便于排查复写问题）    |

**索引**：`idx_poker_analyses_hand (hand_id)`

---

## poker_leaks

Leak 模式记录。每次 Leak 分析完成后全量替换（先 DELETE 再 INSERT）。

| 字段               | 类型              | 说明                                    |
|--------------------|-------------------|-----------------------------------------|
| `id`               | INT UNSIGNED PK   | 自增主键                                |
| `user_id`          | INT UNSIGNED      | 所属用户 ID（FK → poker_users.id）      |
| `pattern`          | TEXT              | Leak 模式描述（含场景、频率）           |
| `occurrences`      | SMALLINT UNSIGNED | 出现次数                                |
| `example_hand_ids` | JSON              | 相关手牌 ID 数组                        |
| `created_at`       | DATETIME          | 创建时间                                |
| `updated_at`       | DATETIME          | 更新时间                                |

**索引**：`idx_poker_leaks_user (user_id, updated_at)`

---

## poker_eval_runs

评估批次记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK | 自增主键 |
| `user_id` | INT UNSIGNED | FK → poker_users.id |
| `hand_id` | INT UNSIGNED | FK → poker_hands.id |
| `requested_models` | JSON | 请求的模型 ID 数组 |
| `status` | ENUM | running / completed / partial / failed |
| `total_cost_usd` | DECIMAL(10,6) | 批次累计成本 |
| `consistency_score` | DECIMAL(5,2) | 模型间 rating 一致率（0-100） |
| `judge_model_id` | VARCHAR(64) | 裁判模型 ID（可空） |
| `created_at` / `updated_at` | DATETIME | — |

**索引**：`idx_eval_runs_hand_time (hand_id, created_at)`、`idx_eval_runs_user_time (user_id, created_at)`

---

## poker_eval_results

单模型评估产物。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK | — |
| `eval_run_id` | INT UNSIGNED | FK → poker_eval_runs.id |
| `hand_id` | INT UNSIGNED | 冗余，便于直查 |
| `model_id` | VARCHAR(64) | 模型标识符 |
| `provider` | VARCHAR(32) | anthropic / openai / google / deepseek / volcengine / moonshot |
| `status` | ENUM | success / failed / timeout |
| `latency_ms` | INT UNSIGNED | 响应延迟 |
| `prompt_tokens` | INT UNSIGNED | — |
| `completion_tokens` | INT UNSIGNED | — |
| `cached_tokens` | INT UNSIGNED | 可空 |
| `cost_usd` | DECIMAL(10,6) | 单次成本 |
| `structured_output` | JSON | schema 合规时的 analyses 数组 |
| `raw_response` | TEXT | 原始响应文本 |
| `error_message` | TEXT | 失败原因（可空） |
| `schema_valid` | BOOLEAN | JSON 是否合规 |
| `judge_score` | TINYINT UNSIGNED | 裁判评分 1-5（可空） |
| `judge_notes` | TEXT | 裁判评语（可空） |
| `created_at` / `updated_at` | DATETIME | — |

**索引**：`idx_eval_results_run (eval_run_id)`、`idx_eval_results_hand_model (hand_id, model_id)`
