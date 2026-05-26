# 设计文档：扑克教练「快速录入」通道

- 状态：待评审
- 日期：2026-05-26
- 范围：`backend/demo/poker-coach/`（H5 Demo）+ `backend/routes/poker.js` + `backend/services/poker-coach/`
- 不在范围：截图/OCR、PokerStars hand history 解析、form.html 自身视觉重做、analysis.html 交互改造、微信小程序前端

## 1. 背景与目标

当前 poker-coach H5 Demo 的录入流程是一个 3 步结构化向导（局况 → 起手牌+筹码 → 行动+结果），每手牌需要数十次点击：选盲注、点桌图选位置、为每个玩家填筹码、给每条街手动构建 action 行（位置 × 动作 × 金额）。打完一手想立刻复盘的用户被这个录入开销劝退。

目标：把"打完到拿到分析"的体感从"填一份表"压到"说一句话 + 扫一眼"，同时保住现有结构化数据资产（`poker_hands` 各字段、Leak 识别、多模型评估都依赖结构化输入）。

## 2. 总体方案

新增"快速录入"通道：

1. 首页 `index.html` 增加一个**自然语言录入卡片**（textarea + "复盘"主按钮）
2. 用户提交后，调用新增的 `POST /api/poker/hands/parse` 端点，由小模型 LLM 把自然语言解析为 `poker_hands` schema
3. 跳转到新增的**确认页 `confirm.html`**：单屏概览 + 行内编辑（chip / card slot 可点改，每条街文本行可"编辑"展开为完整 action-builder）
4. 用户点"保存并复盘" → `POST /api/poker/hands` → 自动触发 `/completions` 分析 → 跳 `analysis.html`

现有 3 步向导 `form.html` **完全保留**，只是从主入口降级为"手动录入"次按钮，并兼具"快速录入兜底"（解析失败时跳转过去，并带上已解析的部分作为 prefill）。

## 3. 架构

```
[index.html]
  ├─ 快速录入卡片 (新)
  │     │ POST /api/poker/hands/parse  {text}
  │     │ ← {hand, missing[], warnings[]}
  │     ↓
  │   [confirm.html] (新)
  │     ├─ 行内编辑：chip / card-slot / 每条街文本行 → "编辑" 展开 action-builder
  │     ├─ 缺字段红笔波浪线提示
  │     ├─ "全部展开编辑" → form.html?prefill=<sessionStorage key>
  │     └─ "保存并复盘" → POST /hands → POST /completions → analysis.html
  │
  └─ "手动录入" 次按钮 → form.html (现有 3 步向导)
```

后端：

```
routes/poker.js
  └─ POST /api/poker/hands/parse   (新)
       │
       ↓
services/poker-coach/
  ├─ parser.js  (新)            — parseHandText(text) → {hand, missing, warnings}
  │     │
  │     ↓
  ├─ prompts.js                 — 新增 PARSER_SYSTEM 常量（完整 schema 描述 + "不要猜"原则）
  │     │
  │     ↓
  └─ core/llm.js                — 复用现有 chat(modelId, messages) 非流式接口
```

## 4. 详细设计

### 4.1 后端：`POST /api/poker/hands/parse`

**位置**：在 `backend/routes/poker.js` 现有 `pokerRouter` 上追加。

**鉴权**：沿用现有 `/completions` 的 anon-token / x-wx-openid 中间件。

**请求**：

```json
{ "text": "1/2 九人桌 BTN 我拿 AhKd，100bb，UTG 加到 3bb 一个人跟，翻牌 Ah7c2s 我下注 5bb 他跟，..." }
```

**前端预检**：

- `text.length < 20` → 不发请求，前端 toast 提示用户讲详细点
- `text.length > 4000` → 客户端截断到 4000 字 + toast 提示

**响应（成功 200）**：

```json
{
  "hand": {
    "blind_level": "1/2",
    "table_type": "9max",
    "hero_position": "BTN",
    "hero_cards": "AhKd",
    "effective_stack_bb": 100,
    "opponents": [{"position": "UTG", "stack_bb": null}],
    "preflop_actions": "UTG raise 3bb, BTN call, others fold",
    "actions": {
      "preflop": [
        {"position": "UTG", "action": "raise", "amount": 3},
        {"position": "BTN", "action": "call", "amount": 3}
      ],
      "flop": [...]
    },
    "flop_cards": "Ah7c2s",
    "flop_actions": "...",
    "turn_card": null, "turn_actions": null,
    "river_card": null, "river_actions": null,
    "result_bb": null,
    "showdown_opp_cards": null,
    "opponent_notes": null,
    "notes": null,
    "played_at": null,
    "raw_input": "<原始 text>"
  },
  "missing": ["opponents[0].stack_bb", "result_bb"],
  "warnings": ["翻牌只识别到 2 张牌"]
}
```

**响应（解析失败 422）**：

```json
{ "error": "parse_failed", "reason": "llm_non_json" | "schema_invalid_all_keys" | "llm_error" }
```

不返回 `raw_llm_output` 给前端（避免暴露 prompt 细节）。

### 4.2 `services/poker-coach/parser.js`

导出 `async function parseHandText(text) → {hand, missing, warnings} | throws`。

**步骤**：

1. 调 `core/llm.js` 的非流式 `chat(modelId, [{role:"system", content: PARSER_SYSTEM}, {role:"user", content: text}])`，`response_format: {type: "json_object"}`（如代理支持）
2. 解析返回的 JSON。`JSON.parse` 失败 → 重试 1 次（同样 prompt + 在 system 末尾追加 "你上次返回了非 JSON，请只输出 JSON 对象"）
3. 重试后仍失败 → throw `parse_failed: llm_non_json`
4. 调 `validateParsedHand(parsed)`：
   - 字段类型 / 枚举值校验（`table_type ∈ {6max, 9max, hu}`、`position ∈ {UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, BB}`、`action ∈ {fold, check, call, bet, raise, allin}`）
   - 牌面格式 `^[2-9TJQKA][shdc]$` 单张、起手牌两张拼接
   - 非法值清空并加入 `warnings`
   - 拼装 `missing` 数组：列出所有 `null` 但通常很重要的字段。统一用**字段路径**字符串格式（顶层字段用裸 key，数组成员用 `[i].key`），例如 `"blind_level"`、`"effective_stack_bb"`、`"result_bb"`、`"opponents[0].stack_bb"`、`"flop_cards"`、`"actions.flop[2].amount"`。前端按这个 key 在 DOM 上查 `data-field="<key>"` 元素挂红笔波浪线，因此 confirm.html 渲染时所有可编辑字段必须带 `data-field` 属性
5. 关键字段全空（`hero_position`、`hero_cards`、`blind_level`、`preflop_actions` **全部** 为 null）→ throw `parse_failed: schema_invalid_all_keys`
6. 返回 `{hand, missing, warnings}`

**模型选型**：小模型，备选 `gpt-4.1-mini` 或 `claude-haiku-4-5-20251001`。具体在实现阶段用一组 fixture 输入对比一次准确率再敲定，写入 `parser.js` 顶部常量。

**日志**：每次调用输出 `[PokerParser]` 前缀，包含：text 长度、模型 ID、首次调用耗时、是否重试、token 用量（如 LLM 返回）、最终 `missing` 长度。LLM 非 JSON / schema 校验失败时把 `raw_llm_output` 一并打到日志（便于事后改 prompt）。

### 4.3 Prompt 设计（`PARSER_SYSTEM`）

放在 `backend/services/poker-coach/prompts.js`。要点：

- 明确"只输出 JSON 对象，不要 markdown 代码块"
- 给出完整 schema 示例（每个字段的类型 + 枚举值 + 示例值）
- **金额一律以大盲倍数（BB）为单位**。用户口语里的 "3bb"、"$15 在 1/2 桌" 都换算为 BB（"$15 在 1/2 桌" = 7.5bb）。换算不出的填 `null` 并标 warning
- **"不要猜"原则**：用户没明确说的字段必须留 `null` 并加入 `missing[]`。不要凭"听起来像 100bb 牌局就填 100bb"这种推测
- **位置识别歧义**：用户说"UTG 加注一个人跟"——需推断"一个人跟"是哪个位置。能按行动顺序唯一推断就推断；推断不出就**对方位置留 null + warning**，不要瞎填
- **桌型推断**：用户说 "九人桌" → 9max；说 "短桌" → 6max；说 "单挑/HU" → hu；没说 → `null` + missing

### 4.4 前端：首页 `index.html` 改造

在现有 `leakBanner` 上方插入"快速录入卡片"：

```html
<div class="quick-entry-card">
  <label class="form-label" style="text-align:center;">讲讲刚才发生了什么</label>
  <textarea id="quickInput" rows="4"
            placeholder='例：1/2 九人桌 BTN AhKd 100bb，UTG 加到 3bb 一个人跟，翻牌 Ah7c2s 我下注 5bb 他跟...'></textarea>
  <button class="btn btn-primary btn-full" id="quickSubmit">复盘 →</button>
</div>
```

底部"+ 录入新手牌"按钮文案改为"手动录入"，样式从 `btn-primary` 降级为 `btn-secondary`。

`home.js` 增加提交逻辑：客户端预检长度 → fetch `/parse` → 成功后把 `hand + missing + warnings + raw_input` 写入 `sessionStorage['quickEntryDraft']` → `location.href = "/poker/confirm.html"`。

失败（网络错 / 422）→ toast 提示 + 跳转 `form.html`（带可用 prefill 时也写 sessionStorage）。

### 4.5 前端：新页面 `confirm.html` + `js/confirm.js`

**布局**（自上而下，单屏可滑动；遵守 `docs/ui/poker-coach/poker-coach-design.md` Coach's Notebook 风格）：

| 区块 | 内容 |
|---|---|
| 顶栏 | ← 返回 + 标题 "Coach is reading your hand…" + 右上"全部展开"次按钮 |
| 局况卡 | 盲注 chip · 桌型 chip · `Hero @ <位置> · <筹码>bb` · 对手列表 |
| 起手卡 | 两个大 card-slot |
| 每条街卡 | 街名 + 公共牌 card-slot + 文本行"位置1 动作 amount · 位置2 动作 amount …" + 右下"✎ 编辑"按钮 |
| 结果卡 | result BB 数字输入（带"从行动估算"链接）+ 可选对手底牌 + 可选 notes |
| 原文卡（默认折叠） | 用户的原始 text |
| 底栏 | "保存并复盘 →" 主按钮 |

**交互细节**：

- 所有 chip / card-slot 行内点击 → 复用 form.html 的同款选牌弹层和 chip 组件（见 4.6 重构）
- 街卡的"✎ 编辑"按钮 → 就地把文本行替换为完整 action-builder（复用 form.js 的 `renderActionBuilder`）
- `missing` 数组里的字段路径对应 DOM 元素（通过 `data-field` 属性查找）加 `class="missing"`，CSS 用红笔波浪线：`text-decoration: underline wavy var(--red); text-underline-offset: 3px`，卡片顶部小手写字提示 "缺: X、Y"
- `warnings` 数组用荧光笔黄色高亮对应区块，并在区块顶部用斜体衬线写一行 warning 内容
- 解析等待期（首页点"复盘"到 confirm.html 渲染）不要骨架屏/旋转器，用一句手写字 "coach is reading…"
- 缺关键字段（`hero_position` / `hero_cards` / `blind_level` / `preflop_actions` 任一为空）→ "保存并复盘"按钮禁用，提示 "补齐红笔标出的字段才能开始"
- 其他字段允许留空（`effective_stack_bb` / `opponents.stack_bb` / `result_bb` / 公共牌 / 后续街 actions），按现有 `/completions` 的逻辑处理
- "全部展开"按钮 → 跳 `form.html?prefill=quickEntryDraft`，form.js 启动时检查 sessionStorage 把字段填入现有 state

**保存路径**：

```
点"保存并复盘"
  → 客户端最终 schema 校验（必填字段齐了）
  → POST /api/poker/hands  {hand 字段 + raw_input}
  → 拿到 hand_id
  → POST /api/poker/completions {hand_id, mode: "analysis"}（SSE 现有逻辑）
  → 跳 analysis.html?hand_id=xxx
```

### 4.6 form.js 重构（组件抽取）

`form.js` 当前 948 行，confirm 页需要复用其中的"选牌弹层"和"action-builder"。重构方案：

新增 `backend/demo/poker-coach/js/widgets.js`，导出：

- `openCardPicker({onPick})` — 选牌弹层（rank + suit 两步）
- `renderChipRow(container, {options, value, onChange})` — chip 选择器
- `renderSegmented(container, {options, value, onChange})` — segmented 控件
- `renderActionBuilder(container, street, state, {onChange})` — 每街 action builder

`form.js` 改为引入这些函数（不内联 DOM 操作），`confirm.js` 同样引入。

**重构原则**：只挪函数，不改行为。挪完后 form.html 走一遍录入回归（每个步骤的每个控件都点一遍 + 保存一手测试），确保零回归。

### 4.7 数据库：新增 `raw_input` 字段

在 `backend/services/poker-coach/models.js` 的 `PokerHand` 中追加：

```js
raw_input: {
  type: DataTypes.TEXT,
  allowNull: true,
  comment: "快速录入通道的原始自然语言输入（手动录入时为 null）",
},
```

Sequelize 启动 sync 时自动加列（沿用现有 `beforeSync` 机制）。

`POST /api/poker/hands` 路由透传 `raw_input` 字段，dao 写入。

### 4.8 文档同步

按 CLAUDE.md 要求：

- `docs/api/poker.md` 新增 `/parse` 端点章节
- `docs/db/poker.md` 在 `poker_hands` 表结构中追加 `raw_input` 列说明
- `docs/ui/poker-coach/poker-coach-design.md` 在"参考实现"末尾追加"确认页"小节，简述行内编辑 / 缺字段红笔波浪线规则
- `CLAUDE.md` 的项目结构图追加 `confirm.html` / `widgets.js` / `parser.js` 三个文件

## 5. 错误处理与边界

| 场景 | 处理 |
|---|---|
| `text.length < 20` | 前端不发请求，toast "讲详细点：盲注、位置、起手牌、行动" |
| `text.length > 4000` | 客户端截断 + toast |
| `/parse` 网络失败 / 5xx | toast "解析失败，转到手动录入" → 跳 `form.html`（无 prefill） |
| `/parse` 返回 422 | 同上 |
| `/parse` 200 但关键字段全空 | 由后端归类为 422 |
| `/parse` 200 但部分字段空 | 进 confirm.html，缺字段红笔波浪线提示 |
| 用户在 confirm 页缺字段未补就点保存 | 按钮禁用 + 提示 |

## 6. 不在本 spec 范围

- 截图 / 拍照 OCR 录入
- PokerStars hand history 文本粘贴解析
- 录音转写（Web Speech API），首版只做 textarea + 手打
- 现有 form.html 3 步向导的视觉/交互瘦身（合并 step、复制上街等）
- analysis.html 自身的交互优化
- 微信小程序前端的对应改造
- profile 页 "默认手动录入" 开关

## 7. 上线步骤

1. 后端：新增 `parser.js`、`prompts.js` 加常量、`routes/poker.js` 加 `/parse` 端点、`models.js` 加 `raw_input` 字段 —— 同一个 PR
   - 验收：curl 一组 fixture 输入跑过，日志可观测，schema 校验严格
2. 前端重构：form.js → widgets.js 抽组件 —— 独立 PR，零行为变更，回归测试 form.html 录入闭环
3. 前端新增：confirm.html / confirm.js + index.html 改造（快速录入卡片，"录入新手牌" → "手动录入"）—— 独立 PR
   - 验收：快速通道端到端跑通；解析失败降级到 form.html 跑通；缺字段红笔波浪线渲染正确
4. 文档同步在每个 PR 内进行（API 文档、DB 文档、设计文档、CLAUDE.md）

## 8. 成本评估

- 单次解析：小模型约 1000 输入 + 500 输出 token，参考 `pricing.js` 现有价目约 ¥0.001/次，可忽略
- 不加专门速率限制（沿用 `/completions` 现有策略）
- 解析失败不写库，无清理逻辑
