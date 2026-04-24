# Poker Coach 大模型横向评估体系 — 设计规格

日期：2025-07-14
分支：poker-coach

## 背景与目标

用户需要横向对比同一手牌在 Claude / OpenAI / Gemini / DeepSeek / 智谱 / 千问 六个大模型下的"分析质量 + token 消耗 + 费用"，为扑克复盘选择性价比最高的模型。

当前 poker-coach 仅支持单模型分析（ReAct 循环），分析结果落 `poker_analyses` 表，不记录来源模型、token 用量或延迟。本设计新增独立评估旁路，**主对话路径零改动**。

---

## 架构总览

```
用户在 compare.html 勾选模型 → POST /api/poker/eval/runs
        │
        ▼
evaluator.js: runEvaluation() (async generator)
        │
        ├─ 查 hand + analyses（复用 dao.getHandWithAnalyses）
        ├─ buildHandContext(hand) 拼评估 prompt
        ├─ Promise.allSettled 并发 fan-out N 个模型（上限 6）
        │     ├─ 每个模型 → lingyaai /v1/chat/completions（非流式，超时 60s）
        │     ├─ JSON.parse + schema 校验
        │     ├─ calculateCost(modelId, usage)
        │     └─ dao.saveEvalResult(...)
        │         └─ SSE yield eval_model_done
        │
        ├─ judgeEvaluation(runId)（Phase 2）
        │     └─ SSE yield eval_judge_done
        │
        ├─ computeConsistency(runId) → 更新 poker_eval_runs
        └─ SSE yield eval_completed → [DONE]
```

---

## 数据模型

### `poker_eval_runs`（评估批次）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK | 自增 |
| `user_id` | INT UNSIGNED | FK → poker_users.id |
| `hand_id` | INT UNSIGNED | FK → poker_hands.id |
| `requested_models` | JSON | 请求的模型 ID 数组 |
| `status` | ENUM | running / completed / partial / failed |
| `total_cost_usd` | DECIMAL(10,6) | 批次累计成本 |
| `consistency_score` | DECIMAL(5,2) | 模型间 rating 一致率（0-100） |
| `judge_model_id` | VARCHAR(64) | 裁判模型 ID（可空） |
| `created_at` / `updated_at` | DATETIME | — |

索引：`(hand_id, created_at)`、`(user_id, created_at)`

### `poker_eval_results`（单模型产物）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK | — |
| `eval_run_id` | INT UNSIGNED | FK → poker_eval_runs.id |
| `hand_id` | INT UNSIGNED | 冗余便于直查 |
| `model_id` | VARCHAR(64) | claude-sonnet-4-5 / gpt-4o / … |
| `provider` | VARCHAR(32) | anthropic / openai / google / deepseek / zhipu / qwen |
| `status` | ENUM | success / failed / timeout |
| `latency_ms` | INT UNSIGNED | — |
| `prompt_tokens` | INT UNSIGNED | — |
| `completion_tokens` | INT UNSIGNED | — |
| `cached_tokens` | INT UNSIGNED | 可空 |
| `cost_usd` | DECIMAL(10,6) | 单次费用 |
| `structured_output` | JSON | 解析后的分析数组 |
| `raw_response` | TEXT | 原始 content 文本（排查用） |
| `error_message` | TEXT | 失败原因 |
| `schema_valid` | BOOLEAN | JSON 是否合规 |
| `judge_score` | TINYINT UNSIGNED | 裁判模型 1-5（可空） |
| `judge_notes` | TEXT | 裁判评语（可空） |
| `created_at` / `updated_at` | DATETIME | — |

索引：`(eval_run_id)`、`(hand_id, model_id)`

---

## 评估模型清单

```js
const EVAL_MODELS = [
  { id: "claude-sonnet-4-5",  provider: "anthropic", label: "Claude Sonnet 4.5" },
  { id: "gpt-4o",             provider: "openai",    label: "OpenAI GPT-4o"     },
  { id: "gemini-2.5-pro",     provider: "google",    label: "Gemini 2.5 Pro"    },
  { id: "deepseek-chat",      provider: "deepseek",  label: "DeepSeek V3"       },
  { id: "glm-4.6v",           provider: "zhipu",     label: "智谱 GLM-4.6V"      },
  { id: "qwen3.5-plus",       provider: "qwen",      label: "千问 Qwen3.5-Plus"  },
];
```

具体 model ID 以 lingyaai 文档为准，首次联调后微调。

---

## 价格表（`backend/services/core/pricing.js`）

占位按各厂商官方价（USD/1M tokens）：

```js
const PRICING = {
  "claude-sonnet-4-5": { input: 3.00,  output: 15.00 },
  "gpt-4o":            { input: 2.50,  output: 10.00 },
  "gemini-2.5-pro":    { input: 1.25,  output: 10.00 },
  "deepseek-chat":     { input: 0.27,  output:  1.10 },
  "glm-4.6v":          { input: 0.29,  output:  1.14 },
  "qwen3.5-plus":      { input: 0.56,  output:  1.68 },
};
```

---

## 评估 Prompt

系统提示词复用 `POKER_SYSTEM_PROMPT`，追加评估专用尾段，要求输出单一 JSON 对象：

```json
{ "analyses": [
  { "street": "preflop|flop|turn|river",
    "rating": "good|acceptable|problematic",
    "scenario": "...", "hero_action": "...", "better_action": "...",
    "reasoning": "...", "principle": "..." }
] }
```

**Schema 校验规则**：
1. `JSON.parse` 成功
2. `analyses` 为非空数组
3. 每条包含 `street / rating / scenario / reasoning / principle`，枚举值合法
4. 不满足则 `schema_valid=false`，仍落库

---

## 一致率算法

对每条有效街，取所有 `status=success && schema_valid=true` 模型的 rating，求众数占比；对所有有效街取平均 × 100，保留 1 位小数写入 `consistency_score`。失败模型不计入分母。

---

## API 端点（新增）

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/poker/eval/runs` | 触发评估（SSE） |
| GET  | `/api/poker/eval/runs?hand_id=:id` | 列出手牌的历史批次 |
| GET  | `/api/poker/eval/runs/:id` | 批次详情（含所有模型结果） |

### SSE 事件序列

```
eval_started        → {eval_run_id, hand_id, models}
eval_model_started  → {eval_run_id, model_id}  × N
eval_model_done     → {eval_run_id, model_id, result: {status, latency_ms, tokens, cost_usd, schema_valid, structured_output}}  × N
eval_judge_done     → {eval_run_id, judge_model_id, scores: [{model_id, score, notes}]}
eval_completed      → {eval_run_id, consistency_score, total_cost_usd, status}
[DONE]
```

---

## API Key 处理

- 前端 `profile.html` 新增 lingyaai API Key 输入框，存为 `apiKeys.lingyaai`
- compare.html 发请求时从 `apiKeys.lingyaai` 取出，填入 `X-Api-Key` 请求头
- 后端 `evaluator.js` 从 `req.headers["x-api-key"]` 读取，直接转发给 lingyaai
- 主对话 `/completions` 走各自厂商 key，互不干扰

---

## 前端（`compare.html`）

- 入口：`analysis.html` 手牌概要下方加"横向对比多模型 →"按钮，跳转 `compare.html?hand_id=:id`
- 默认全选 6 个模型，可取消勾选
- **表格**：行 = 街，列 = 模型；单元格显示 rating 色块，点击展开 scenario / hero_action / better_action / reasoning / principle
- **表底汇总行**：延迟(ms)、prompt tokens、completion tokens、cost(USD)、schema_valid(✓/✗)、judge_score(★)
- **顶部 KPI**：一致率、总成本、最快模型、最省模型
- **历史批次下拉**：同一手牌多次评估可切换查看

---

## 新增 / 修改文件清单

### 新建
- `backend/services/core/pricing.js`
- `backend/services/poker-coach/hand-context.js`
- `backend/services/poker-coach/evaluator.js`
- `backend/demo/poker-coach/compare.html`
- `backend/demo/poker-coach/js/compare.js`

### 修改
- `backend/services/poker-coach/models.js` — 新增两个 Sequelize 模型
- `backend/services/poker-coach/dao.js` — 新增 7 个评估 CRUD 函数
- `backend/routes/poker.js` — 新增 3 个评估路由
- `backend/demo/poker-coach/analysis.html` — 加入口按钮
- `backend/demo/poker-coach/js/types.js` — MODEL_CONFIG 扩展，修复 glm-4-plus → glm-4.6v
- `backend/demo/poker-coach/profile.html` — 新增 lingyaai API Key 输入框，对齐模型下拉
- `docs/api/poker.md` — 新增评估体系章节
- `docs/db/poker.md` — 新增两表结构
- `CLAUDE.md` — 同步"扑克教练支持大模型横向评估"

### 不改动
- `backend/services/core/llm.js` / `brain.js` / `skill-registry.js`
- `backend/services/poker-coach/skills.js` / `brain-config.js`
- 主对话 `POST /api/poker/completions` 行为

---

## 实施阶段

### Phase 1（核心可用）
1. `models.js` 新增两张表
2. `dao.js` 基础 CRUD + `computeConsistency`
3. `pricing.js` 价格表 + `calculateCost`
4. `hand-context.js` 手牌文本化
5. `evaluator.js` 并发调用 + schema 校验 + cost 计算
6. `poker.js` 新增 3 个路由
7. `compare.html` + `compare.js` + analysis 入口按钮
8. `types.js` 扩展 + `profile.html` lingyaai key 输入框

### Phase 2（裁判模型）
9. `evaluator.js` 新增 `judgeEvaluation()`，裁判模型默认 `claude-sonnet-4-6`
10. 主评估完成后自动触发裁判，SSE 推送 `eval_judge_done`
11. `compare.html` 加 judge_score 列

### Phase 3（文档）
12. `docs/api/poker.md` + `docs/db/poker.md` + `CLAUDE.md` 同步

---

## 风险与取舍

- **lingyaai 可用性**：中间商不稳定时整个评估失败；MVP 不做重试，超时 60s 记 `timeout`
- **价格占位**：PRICING 按官方价估算，需对着 lingyaai 账单校准
- **模型 ID 漂移**：lingyaai model ID 可能带前缀，首次联调时微调 `EVAL_MODELS`
- **裁判偏见**：用某家模型做裁判必然偏向本家输出，MVP 先接受
- **schema 合规率低**：prompt 末尾加强约束，不合规仍落库
