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
| `is_analyzed`         | BOOLEAN           | 是否已完成 AI 分析，默认 false          |
| `created_at`          | DATETIME          | 创建时间                                |
| `updated_at`          | DATETIME          | 更新时间                                |

**索引**：`idx_poker_hands_user_time (user_id, created_at)`

---

## poker_analyses

决策点分析结果。每手牌最多 1-2 条，由 Agent 调用 `save_analysis` 工具写入。

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
