# 扑克教练录入手牌交互优化 — 设计文档

## 概述

优化 poker-coach H5 Demo 的手牌录入表单（form.html + form.js），涉及三个核心改动：

1. Step 0（局况）：圆桌支持标记多个对手及其筹码
2. Step 2（行动）：翻牌/转牌/河牌按需展开；行动区从自由文本 textarea 改为结构化行动行列表，根据已录入玩家自动生成
3. 后端：新增 JSON 字段存储结构化对手和行动数据

## 1. Step 0 — 局况（对手标记）

### 座位三态

| 状态 | 视觉 | 点击行为 |
|------|------|----------|
| 空位 | 默认灰色边框 | Hero 未选时设为 Hero；Hero 已选时标记为对手 |
| Hero | 深色填充（现有 `.selected`） | 取消 Hero 选择 |
| 对手 | 琥珀色边框 + 浅色填充 | 取消对手标记 |

### 默认桌型

默认桌型从 `6max` 改为 `9max`，初始渲染 9 个座位。

### 对手列表

圆桌下方新增"已入座玩家列表"区域：
- Hero 一行（显示位置 + 有效筹码输入，复用现有 `effectiveStack` 字段）
- 每个已标记对手一行（位置标签 + 筹码 BB 输入框 + 移除按钮）
- 未标记任何对手时显示提示文字："点击圆桌上的空位添加对手"

### 数据结构

```js
state.opponents = [
  { position: "CO", stack_bb: "" },
  { position: "BB", stack_bb: "" }
]
```

切换桌型时，不在新桌型位置列表中的对手自动移除（同现有 hero_position 逻辑）。

## 2. Step 2 — 结构化行动构建器

### 行动行结构

每行：`[位置标签] [行动选择器] [金额输入]`

- 位置标签：只读文字，Hero 行额外高亮
- 行动选择器：下拉/分段控件
  - Preflop: fold / call / raise / 3bet / 4bet / all-in
  - Postflop: check / bet / call / raise / fold / all-in
- 金额输入：仅当行动为 raise / bet / 3bet / 4bet / all-in 时显示，输入 BB 数

### Preflop 行动生成

按翻前行动顺序生成行动行（仅 Hero + 已标记对手参与）：

```
9max 翻前顺序：UTG → UTG+1 → UTG+2 → LJ → HJ → CO → BTN → SB → BB
```

过滤规则：跳过未标记为对手且非 Hero 的位置。

**智能追加逻辑：**
- 当某人选择 raise/3bet/4bet 时，自动在末尾追加从该玩家之后到该玩家之前（绕一圈）还在手中且尚未对当前 raise 做出回应的玩家
- 追加的行默认为 fold，用户可修改
- 如果追加行中又有人 raise，继续递归追加

### Postflop 行动生成

按翻后行动顺序生成（仅未 fold 的玩家）：

```
9max 翻后顺序：SB → BB → UTG → UTG+1 → UTG+2 → LJ → HJ → CO → BTN
```

同样支持智能追加（bet/raise 后追加后续玩家）。

### 街道展开

- Flop/Turn/River 默认隐藏，点"+ 翻牌 Flop"展开（现有逻辑不变）
- 展开时自动生成该街的行动行（基于上一街存活玩家）
- 移除街道时清空对应行动数据（现有逻辑不变）

### 找回已 fold 玩家

每条街行动列表底部显示"+ 添加玩家"按钮：
- 点击弹出下拉，列出在本街之前已 fold 但实际仍在局中的玩家
- 选择后在行动列表末尾追加该玩家的行动行
- 用于修正录入错误

### 数据序列化

前端 state 中行动以结构化数组存储：

```js
state.actions = {
  preflop: [
    { position: "UTG", action: "fold", amount: null },
    { position: "CO", action: "raise", amount: 6 },
    { position: "BTN", action: "fold", amount: null },
    { position: "Hero(SB)", action: "3bet", amount: 18 },
    { position: "CO", action: "call", amount: null }
  ],
  flop: [...],
  turn: [...],
  river: [...]
}
```

提交时同时生成文本版本填入旧字段（向后兼容）：
- `preflop_actions`: `"UTG fold，CO raise 6，BTN fold，Hero 3bet 18，CO call"`
- 同理 `flop_actions`、`turn_actions`、`river_actions`

## 3. DB 变更

`poker_hands` 表新增：

| 字段 | 类型 | 说明 |
|------|------|------|
| `opponents` | JSON | `[{position, stack_bb}]`，已标记对手信息 |
| `actions` | JSON | `{preflop: [{position, action, amount?}], ...}`，结构化行动 |

保留现有 TEXT 字段（`preflop_actions`、`flop_actions` 等），提交时同时写入文本版本和 JSON 版本。

## 4. 后端 API 变更

### POST /api/poker/hands

请求体新增可选字段：
- `opponents`: JSON 数组
- `actions`: JSON 对象

后端逻辑：
- 如果提供了 `actions` JSON，自动从中生成文本版本填入 `preflop_actions`、`flop_actions` 等字段（若前端未提供文本版本）
- 如果提供了 `opponents` JSON，同时将其序列化为可读文本写入 `opponent_notes`（向后兼容）

### GET /api/poker/hands/:id

响应体新增 `opponents` 和 `actions` 字段（JSON 格式）。

## 5. 涉及文件清单

| 文件 | 变更类型 |
|------|----------|
| `backend/demo/poker-coach/form.html` | 修改 Step 0 和 Step 2 的 HTML 结构 |
| `backend/demo/poker-coach/js/form.js` | 重写 Step 0 对手标记 + Step 2 行动构建器逻辑 |
| `backend/demo/poker-coach/js/types.js` | 新增 postflop 顺序常量、行动类型常量 |
| `backend/demo/poker-coach/css/style.css` | 新增对手座位样式、行动行样式 |
| `backend/services/poker-coach/models.js` | 新增 `opponents`、`actions` JSON 列 |
| `backend/services/poker-coach/dao.js` | 适配新字段的 CRUD |
| `backend/routes/poker.js` | 适配新字段的入参处理 |
| `docs/db/poker.md` | 更新表结构文档 |

## 6. 不做的事

- 不改动 Step 1（起手牌）和 Step 3（结果）的核心逻辑
- 不改动分析页面（analysis.html）
- 不改动 AI 对话接口（completions）
- 不做手牌历史数据迁移（旧记录保持纯文本格式）
