# 扑克教练录入手牌交互优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 poker-coach H5 Demo 手牌录入表单：圆桌支持多对手标记、行动区改为结构化行动行列表、后端新增 JSON 字段。

**Architecture:** 后端先行（新增 DB 列 + 适配路由），再改前端常量/样式，最后重写 form.html 和 form.js 的 Step 0（对手标记）和 Step 2（行动构建器）。前端无测试框架，以手动验证为准。

**Tech Stack:** Express.js + Sequelize (后端), 原生 HTML/CSS/JS (前端 H5 Demo)

---

## 文件结构

| 文件 | 变更 | 职责 |
|------|------|------|
| `backend/services/poker-coach/models.js` | 修改 | 新增 `opponents`、`actions` JSON 列 |
| `backend/services/poker-coach/dao.js` | 修改 | `createHand` 适配新字段 |
| `backend/routes/poker.js` | 修改 | 请求处理：从 `actions` JSON 生成文本回填旧字段 |
| `docs/db/poker.md` | 修改 | 更新表结构文档 |
| `backend/demo/poker-coach/js/types.js` | 修改 | 新增 postflop 顺序、行动类型常量 |
| `backend/demo/poker-coach/css/style.css` | 修改 | 新增对手座位、玩家列表、行动行样式 |
| `backend/demo/poker-coach/form.html` | 修改 | Step 0 新增玩家列表区、Step 2 替换为行动构建器容器 |
| `backend/demo/poker-coach/js/form.js` | 修改 | 核心逻辑重写：对手标记 + 行动构建器 |

---

### Task 1: 后端 — DB 模型新增 JSON 列

**Files:**
- Modify: `backend/services/poker-coach/models.js:33-139`

- [ ] **Step 1: 在 PokerHand 模型中新增 opponents 和 actions 列**

在 `models.js` 的 `PokerHand` 定义中（`played_at` 之后、`is_analyzed` 之前），新增两个字段：

```js
      opponents: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "对手信息 [{position, stack_bb}]",
      },
      actions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "结构化行动 {preflop: [{position, action, amount?}], flop?, turn?, river?}",
      },
```

- [ ] **Step 2: 启动后端验证自动建表**

Run: `cd D:\Cursor_Projects\mini-cloud && pnpm dev`

验证控制台无报错，Sequelize sync 成功新增列。Ctrl+C 停止。

- [ ] **Step 3: 提交**

```bash
git add backend/services/poker-coach/models.js
git commit -m "feat(poker): 新增 opponents/actions JSON 列到 poker_hands 表"
```

---

### Task 2: 后端 — DAO 和路由适配新字段

**Files:**
- Modify: `backend/services/poker-coach/dao.js:19-42`
- Modify: `backend/routes/poker.js:141-150`

- [ ] **Step 1: dao.js — createHand 新增 opponents 和 actions 字段**

在 `dao.js` 的 `createHand` 函数中，在 `played_at` 行之后、`is_analyzed` 行之前，新增：

```js
    opponents: data.opponents || null,
    actions: data.actions || null,
```

- [ ] **Step 2: poker.js — handleCreateHand 中从 actions JSON 自动生成文本回填**

将 `handleCreateHand` 函数替换为：

```js
async function handleCreateHand(req, res) {
  await withUser(req, res, async (userId) => {
    const data = { ...req.body };

    // 从 actions JSON 自动生成文本版本回填旧字段（向后兼容）
    if (data.actions && !data.preflop_actions) {
      data.preflop_actions = serializeActions(data.actions.preflop);
      data.flop_actions = serializeActions(data.actions.flop) || data.flop_actions;
      data.turn_actions = serializeActions(data.actions.turn) || data.turn_actions;
      data.river_actions = serializeActions(data.actions.river) || data.river_actions;
    }

    // 从 opponents JSON 自动生成 opponent_notes 文本（向后兼容）
    if (data.opponents && !data.opponent_notes) {
      data.opponent_notes = data.opponents.map(function (o) {
        return o.position + (o.stack_bb ? " (" + o.stack_bb + "BB)" : "");
      }).join("，");
    }

    const { blind_level, hero_position, hero_cards, preflop_actions } = data;
    if (!blind_level || !hero_position || !hero_cards || !preflop_actions) {
      return res.status(400).json({ error: "缺少必填字段：blind_level / hero_position / hero_cards / preflop_actions" });
    }
    const handId = await dao.createHand(userId, data);
    res.json({ hand_id: handId });
  });
}

function serializeActions(actionsArr) {
  if (!actionsArr || actionsArr.length === 0) return null;
  return actionsArr.map(function (a) {
    var label = a.position;
    var text = label + " " + a.action;
    if (a.amount != null) text += " " + a.amount;
    return text;
  }).join("，");
}
```

- [ ] **Step 3: 启动后端快速验证**

Run: `cd D:\Cursor_Projects\mini-cloud && pnpm dev`

验证启动无报错。Ctrl+C 停止。

- [ ] **Step 4: 提交**

```bash
git add backend/services/poker-coach/dao.js backend/routes/poker.js
git commit -m "feat(poker): DAO 和路由适配 opponents/actions JSON 字段"
```

---

### Task 3: 更新数据库文档

**Files:**
- Modify: `docs/db/poker.md:20-44`

- [ ] **Step 1: 在 poker_hands 表文档中新增两行**

在 `played_at` 行之后、`is_analyzed` 行之前，插入：

```markdown
| `opponents`           | JSON              | 对手信息 `[{position, stack_bb}]`（可为空） |
| `actions`             | JSON              | 结构化行动 `{preflop: [{position, action, amount?}], ...}`（可为空） |
```

- [ ] **Step 2: 提交**

```bash
git add docs/db/poker.md
git commit -m "docs(poker): 更新表结构文档，新增 opponents/actions 字段"
```

---

### Task 4: 前端 — types.js 新增常量和工具函数

**Files:**
- Modify: `backend/demo/poker-coach/js/types.js`

- [ ] **Step 1: 新增 postflop 位置顺序和行动类型常量**

在 `types.js` 文件末尾（`showToast` 函数之后）追加：

```js
// ===== Postflop 行动顺序（从 SB 开始顺时针）=====

var POSTFLOP_ORDER_9MAX = ["SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"];
var POSTFLOP_ORDER_6MAX = ["SB", "BB", "UTG", "UTG+1", "CO", "BTN"];
var POSTFLOP_ORDER_HU   = ["BTN/SB", "BB"];

function getPostflopOrder(tableType) {
  if (tableType === "9max") return POSTFLOP_ORDER_9MAX;
  if (tableType === "hu") return POSTFLOP_ORDER_HU;
  return POSTFLOP_ORDER_6MAX;
}

// ===== 行动类型 =====

var PREFLOP_ACTIONS  = ["fold", "call", "raise", "3bet", "4bet", "all-in"];
var POSTFLOP_ACTIONS = ["check", "bet", "call", "raise", "fold", "all-in"];

// 需要填金额的行动
function actionNeedsAmount(action) {
  return ["raise", "bet", "3bet", "4bet", "all-in"].indexOf(action) !== -1;
}

// 是否为 aggressive 行动（触发智能追加）
function isAggressiveAction(action) {
  return ["raise", "3bet", "4bet", "bet"].indexOf(action) !== -1;
}
```

- [ ] **Step 2: 提交**

```bash
git add backend/demo/poker-coach/js/types.js
git commit -m "feat(poker): types.js 新增 postflop 顺序和行动类型常量"
```

---

### Task 5: 前端 — CSS 新增对手座位、玩家列表、行动行样式

**Files:**
- Modify: `backend/demo/poker-coach/css/style.css`

- [ ] **Step 1: 新增对手座位样式**

在 `style.css` 末尾（`@media` 之前）追加：

```css
/* ===== 对手座位 ===== */

.seat.opponent {
  background: rgba(184,117,26,0.12);
  border-color: var(--amber);
  color: var(--amber);
  border-width: 2px;
}

.seat.opponent:hover {
  background: rgba(184,117,26,0.22);
}

/* ===== 已入座玩家列表 ===== */

.player-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-list-hint {
  font-family: var(--font-hand);
  font-size: 15px;
  color: var(--ink-faint);
  font-style: italic;
  text-align: center;
  padding: 10px 0;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #F7EED6;
  border: 1px solid var(--ink-line);
}

.player-row.hero {
  border-color: var(--ink);
  border-width: 1.5px;
}

.player-pos {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
  min-width: 48px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.player-row.hero .player-pos {
  color: var(--red);
}

.player-label {
  font-family: var(--font-hand);
  font-size: 15px;
  color: var(--ink-soft);
  flex-shrink: 0;
}

.player-stack-input {
  width: 72px;
  padding: 4px 6px;
  border: 1px solid rgba(43,34,26,0.3);
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  background: var(--paper);
  text-align: center;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
  margin-left: auto;
}

.player-stack-input:focus {
  border-color: var(--ink);
}

.player-stack-input::placeholder {
  color: var(--ink-faint);
  font-style: italic;
}

.player-stack-suffix {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faint);
  flex-shrink: 0;
}

.player-remove {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--ink-faint);
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.player-remove:hover {
  color: var(--red);
}

/* ===== 结构化行动行 ===== */

.action-builder {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.action-row {
  display: grid;
  grid-template-columns: 54px 1fr auto;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  background: var(--paper);
  border: 1px solid var(--ink-line);
}

.action-row.hero-row {
  border-color: rgba(164,49,40,0.3);
  background: rgba(164,49,40,0.04);
}

.action-pos {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-row.hero-row .action-pos {
  color: var(--red);
}

.action-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(43,34,26,0.25);
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink);
  background: #F7EED6;
  cursor: pointer;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%232B221A' opacity='0.4' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  padding-right: 22px;
}

.action-select:focus {
  border-color: var(--ink);
}

.action-amount {
  width: 56px;
  padding: 6px;
  border: 1px solid rgba(43,34,26,0.25);
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  background: var(--paper);
  text-align: center;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
}

.action-amount:focus {
  border-color: var(--ink);
}

.action-amount::placeholder {
  color: var(--ink-faint);
}

.action-amount[hidden] {
  display: none;
}

/* 添加玩家按钮（找回已 fold 的） */
.add-player-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: transparent;
  border: 1px dashed var(--ink-line);
  font-family: var(--font-hand);
  font-size: 15px;
  color: var(--ink-faint);
  cursor: pointer;
  width: 100%;
  transition: all 0.15s;
  border-radius: 0;
}

.add-player-btn:hover {
  border-color: var(--ink);
  color: var(--ink);
}

.add-player-dropdown {
  position: relative;
}

.add-player-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--paper);
  border: 1.5px solid var(--ink);
  box-shadow: var(--shadow-md);
  z-index: 80;
  max-height: 180px;
  overflow-y: auto;
}

.add-player-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-family: var(--font);
  font-size: 14px;
  color: var(--ink);
  cursor: pointer;
}

.add-player-menu button:hover {
  background: var(--paper-dark);
}
```

- [ ] **Step 2: 更新响应式媒体查询中的行动行**

在已有 `@media (max-width: 360px)` 块末尾（`}` 之前）追加：

```css
  .action-row { grid-template-columns: 46px 1fr auto; }
  .action-pos { font-size: 10px; min-width: 40px; }
  .action-amount { width: 48px; }
```

- [ ] **Step 3: 提交**

```bash
git add backend/demo/poker-coach/css/style.css
git commit -m "feat(poker): 新增对手座位、玩家列表、行动行 CSS 样式"
```

---

### Task 6: 前端 — form.html 结构变更

**Files:**
- Modify: `backend/demo/poker-coach/form.html`

- [ ] **Step 1: Step 0 — 移除旧有效筹码/日期行，新增玩家列表区域**

在 `form.html` 中，将 Step 0 的 `<div class="wizard-pane" data-pane="0">` 整体替换为：

```html
      <!-- ======= Step 0: 局况 ======= -->
      <div class="wizard-pane" data-pane="0">

        <div class="form-group">
          <label class="form-label">盲注 <span class="required">*</span></label>
          <div class="chip-row" id="blindChips">
            <button type="button" class="chip" data-blind="0.5/1">0.5/1</button>
            <button type="button" class="chip" data-blind="1/2">1/2</button>
            <button type="button" class="chip" data-blind="2/5">2/5</button>
            <button type="button" class="chip" data-blind="5/10">5/10</button>
            <button type="button" class="chip" data-blind="10/25">10/25</button>
            <button type="button" class="chip" data-blind="25/50">25/50</button>
            <button type="button" class="chip" data-blind="__custom__">自定义</button>
          </div>
          <input class="form-control" id="blindCustom" type="text"
            placeholder="如 3/6" style="display:none;margin-top:8px;" />
        </div>

        <div class="form-group" style="margin-top:18px;">
          <label class="form-label">桌型 <span class="required">*</span></label>
          <div class="segmented" id="tableSeg">
            <button type="button" data-table="6max">6-Max</button>
            <button type="button" data-table="9max" class="active">9-Max</button>
            <button type="button" data-table="hu">Heads-Up</button>
          </div>
        </div>

        <div class="form-group" style="margin-top:22px;">
          <label class="form-label">选座 <span class="required">*</span></label>
          <div class="poker-table-wrap">
            <div class="poker-table" id="positionTable"></div>
            <div class="poker-table-center">
              <div class="poker-table-blind" id="centerBlind">—</div>
              <div class="poker-table-type" id="centerType">nine-max</div>
            </div>
          </div>
          <div class="position-hint" id="positionHint">先点圆圈选 Hero，再点其他位置添加对手</div>
        </div>

        <!-- 已入座玩家列表 -->
        <div class="player-list" id="playerList"></div>

        <div class="form-group" style="margin-top:18px;">
          <label class="form-label">牌局日期</label>
          <input class="form-control" id="playedAt" type="date" />
        </div>

      </div>
```

注意：9-Max 按钮默认 `class="active"`，`centerType` 默认文字改为 `nine-max`。有效筹码输入移到 playerList 的 Hero 行内。

- [ ] **Step 2: Step 2 — 将 textarea 替换为行动构建器容器**

将 Step 2 的 `<div class="wizard-pane" data-pane="2">` 整体替换为：

```html
      <!-- ======= Step 2: 行动 ======= -->
      <div class="wizard-pane" data-pane="2" hidden>

        <div class="street-pane">
          <div class="street-pane-header">
            <span class="street-pane-name">翻前 Preflop <span class="required">*</span></span>
          </div>
          <div class="action-builder" id="preflopBuilder"></div>
        </div>

        <button type="button" class="street-add" data-add="flop">+ 翻牌 Flop</button>
        <div class="street-pane" data-street="flop" hidden>
          <div class="street-pane-header">
            <span class="street-pane-name">翻牌 Flop</span>
            <button type="button" class="street-remove" data-remove="flop">移除</button>
          </div>
          <div class="board-row" id="flopBoard">
            <button type="button" class="card-slot small" data-target="flop:0"><span class="card-slot-placeholder">flop 1</span></button>
            <button type="button" class="card-slot small" data-target="flop:1"><span class="card-slot-placeholder">flop 2</span></button>
            <button type="button" class="card-slot small" data-target="flop:2"><span class="card-slot-placeholder">flop 3</span></button>
          </div>
          <div class="action-builder" id="flopBuilder"></div>
        </div>

        <button type="button" class="street-add" data-add="turn" hidden>+ 转牌 Turn</button>
        <div class="street-pane" data-street="turn" hidden>
          <div class="street-pane-header">
            <span class="street-pane-name">转牌 Turn</span>
            <button type="button" class="street-remove" data-remove="turn">移除</button>
          </div>
          <div class="board-row">
            <button type="button" class="card-slot small" data-target="turn:0"><span class="card-slot-placeholder">turn</span></button>
          </div>
          <div class="action-builder" id="turnBuilder"></div>
        </div>

        <button type="button" class="street-add" data-add="river" hidden>+ 河牌 River</button>
        <div class="street-pane" data-street="river" hidden>
          <div class="street-pane-header">
            <span class="street-pane-name">河牌 River</span>
            <button type="button" class="street-remove" data-remove="river">移除</button>
          </div>
          <div class="board-row">
            <button type="button" class="card-slot small" data-target="river:0"><span class="card-slot-placeholder">river</span></button>
          </div>
          <div class="action-builder" id="riverBuilder"></div>
        </div>

      </div>
```

- [ ] **Step 3: 提交**

```bash
git add backend/demo/poker-coach/form.html
git commit -m "feat(poker): form.html 结构变更 — 玩家列表区 + 行动构建器容器"
```

---

### Task 7: 前端 — form.js 重写（核心逻辑）

这是最大的 Task，包含 state 变更、对手标记、行动构建器、提交逻辑。整体替换 `form.js`。

**Files:**
- Modify: `backend/demo/poker-coach/js/form.js` (完整重写)

- [ ] **Step 1: 重写 form.js — state 定义和工具函数**

将 `form.js` 完整替换。以下分段展示完整内容。先写 state 和通用工具：

```js
// ===== 向导状态 =====

var STEP_TITLES = ["坐到了哪里？", "你的起手牌", "逐街还原行动", "最后结果"];
var TABLE_LABEL = { "6max": "six-max", "9max": "nine-max", "hu": "heads-up" };

var state = {
  step: 0,
  blind_level: "",
  blind_custom: false,
  table_type: "9max",
  hero_position: null,
  played_at: "",
  // 对手列表
  opponents: [],
  // Hero 筹码（从旧 effective_stack_bb 迁移到 player list）
  hero_stack_bb: "",
  // 起手牌
  hero_cards: [null, null],
  // 行动（结构化）
  actions: { preflop: [], flop: [], turn: [], river: [] },
  // 街道展开状态
  flop_open: false,
  flop_cards: [null, null, null],
  turn_open: false,
  turn_card: [null],
  river_open: false,
  river_card: [null],
  // 结果
  result_bb: "",
  showdown_opp_cards: [null, null],
  opponent_notes: "",
  notes: "",
};

var pickerTarget = null;
var pickerRank = null;

// ===== 通用工具 =====

function $(id) { return document.getElementById(id); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function targetSlot(target) {
  var parts = target.split(":");
  var key = parts[0];
  var idx = parseInt(parts[1], 10);
  var arr;
  if (key === "hero")  arr = state.hero_cards;
  if (key === "flop")  arr = state.flop_cards;
  if (key === "turn")  arr = state.turn_card;
  if (key === "river") arr = state.river_card;
  if (key === "opp")   arr = state.showdown_opp_cards;
  return { key: key, arr: arr, idx: idx };
}

// 获取参与牌局的所有位置（Hero + opponents），按指定顺序排列
function getActivePlayers(order) {
  var heroPos = state.hero_position;
  var oppPositions = state.opponents.map(function (o) { return o.position; });
  var all = [];
  if (heroPos) all.push(heroPos);
  all = all.concat(oppPositions);
  // 按给定顺序排列
  return order.filter(function (pos) { return all.indexOf(pos) !== -1; });
}

// 获取某街结束后仍在手的玩家
function getAliveAfterStreet(street) {
  var order = street === "preflop"
    ? getPositions(state.table_type)
    : getPostflopOrder(state.table_type);
  var alive = getActivePlayers(order);
  var actions = state.actions[street] || [];
  // 找出最终 fold 的玩家
  var folded = {};
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (a.action === "fold") folded[pos] = true;
    // 如果之后又有行动（被添加回来），取消 fold
    if (a.action !== "fold") delete folded[pos];
  });
  return alive.filter(function (pos) { return !folded[pos]; });
}

// 判断某位置在某街的行动中是否最终 fold 了
function isFoldedInStreet(position, street) {
  var actions = state.actions[street] || [];
  var folded = false;
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (pos === position) {
      folded = (a.action === "fold");
    }
  });
  return folded;
}

// 获取在之前所有街中仍存活的玩家
function getAliveForStreet(street) {
  var streets = ["preflop", "flop", "turn", "river"];
  var idx = streets.indexOf(street);
  if (idx <= 0) {
    var order = getPositions(state.table_type);
    return getActivePlayers(order);
  }
  return getAliveAfterStreet(streets[idx - 1]);
}
```

- [ ] **Step 2: 重写 form.js — 步骤切换和校验**

接续上面的代码，添加步骤切换逻辑：

```js
// ===== 步骤切换 =====

function gotoStep(idx) {
  if (idx < 0 || idx > 3) return;
  state.step = idx;

  $$(".wizard-pane").forEach(function (el) {
    el.hidden = parseInt(el.dataset.pane, 10) !== idx;
  });
  $$(".wizard-step").forEach(function (el) {
    var i = parseInt(el.dataset.idx, 10);
    el.classList.toggle("active", i === idx);
    el.classList.toggle("done", i < idx);
  });
  $("stepTitle").textContent = STEP_TITLES[idx];
  $("stepCounter").textContent = (idx + 1) + "/4";

  $("prevBtn").disabled = (idx === 0);
  $("nextBtn").textContent = (idx === 3) ? "保存并分析" : "下一步 →";

  $("scrollArea").scrollTop = 0;

  // 进入行动步骤时，自动初始化 preflop 行动行
  if (idx === 2 && state.actions.preflop.length === 0) {
    initStreetActions("preflop");
  }

  refreshAll();
}

function validateStep(idx) {
  if (idx === 0) {
    if (!state.blind_level)   return "请选择盲注级别";
    if (!state.hero_position) return "请选择 Hero 位置";
    if (state.opponents.length === 0) return "请至少标记一个对手";
    return null;
  }
  if (idx === 1) {
    if (!state.hero_cards[0] || !state.hero_cards[1]) return "请选齐两张起手牌";
    if (state.hero_cards[0] === state.hero_cards[1])  return "两张牌不能相同";
    return null;
  }
  if (idx === 2) {
    if (state.actions.preflop.length === 0) return "请填写翻前行动";
    // 检查是否有未选择行动的行
    var hasEmpty = state.actions.preflop.some(function (a) { return !a.action; });
    if (hasEmpty) return "请为每个玩家选择翻前行动";
    if (state.flop_open && state.flop_cards.some(function (c) { return !c; })) return "请补齐翻牌三张公共牌";
    if (state.turn_open && !state.turn_card[0])  return "请补齐转牌";
    if (state.river_open && !state.river_card[0]) return "请补齐河牌";
    return null;
  }
  return null;
}

function nextStep() {
  var err = validateStep(state.step);
  if (err) { showToast(err); return; }
  if (state.step === 3) { submit(); return; }
  gotoStep(state.step + 1);
}

function prevStep() { gotoStep(state.step - 1); }
```

- [ ] **Step 3: 重写 form.js — Step 0 局况（盲注 + 桌型 + 座位三态 + 玩家列表）**

接续添加：

```js
// ===== 步骤 0: 局况 =====

function renderBlindChips() {
  $$("#blindChips .chip").forEach(function (btn) {
    var v = btn.dataset.blind;
    var isCustom = (v === "__custom__");
    var active = isCustom ? state.blind_custom : (!state.blind_custom && state.blind_level === v);
    btn.classList.toggle("active", active);
  });
  $("blindCustom").style.display = state.blind_custom ? "block" : "none";
  $("centerBlind").textContent = state.blind_level ? "$" + state.blind_level : "—";
}

function bindBlindChips() {
  $$("#blindChips .chip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var v = btn.dataset.blind;
      if (v === "__custom__") {
        state.blind_custom = true;
        state.blind_level = $("blindCustom").value.trim();
      } else {
        state.blind_custom = false;
        state.blind_level = v;
        $("blindCustom").value = "";
      }
      renderBlindChips();
      if (state.blind_custom) setTimeout(function () { $("blindCustom").focus(); }, 0);
    });
  });
  $("blindCustom").addEventListener("input", function (e) {
    state.blind_level = e.target.value.trim();
    renderBlindChips();
  });
}

function renderTableSeg() {
  $$("#tableSeg button").forEach(function (b) {
    b.classList.toggle("active", b.dataset.table === state.table_type);
  });
  $("centerType").textContent = TABLE_LABEL[state.table_type];
  var positions = getPositions(state.table_type);
  if (state.hero_position && positions.indexOf(state.hero_position) === -1) {
    state.hero_position = null;
  }
  // 移除不在新桌型里的对手
  state.opponents = state.opponents.filter(function (o) {
    return positions.indexOf(o.position) !== -1;
  });
  renderPositionTable();
  renderPlayerList();
}

function bindTableSeg() {
  $$("#tableSeg button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.table_type = b.dataset.table;
      renderTableSeg();
    });
  });
}

function renderPositionTable() {
  var table = $("positionTable");
  table.innerHTML = "";
  var positions = getPositions(state.table_type);
  var n = positions.length;
  var rect = table.getBoundingClientRect();
  var size = rect.width || 280;
  var seatSize = size <= 250 ? 50 : 56;
  var cx = size / 2, cy = size / 2;
  var r = (size / 2) - seatSize * 0.55;
  var oppPositions = state.opponents.map(function (o) { return o.position; });

  positions.forEach(function (pos, i) {
    var a = (-Math.PI / 2) + (i * 2 * Math.PI / n);
    var x = cx + r * Math.cos(a);
    var y = cy + r * Math.sin(a);
    var btn = document.createElement("button");
    btn.type = "button";
    var isHero = (state.hero_position === pos);
    var isOpp = (oppPositions.indexOf(pos) !== -1);
    btn.className = "seat" + (isHero ? " selected" : "") + (isOpp ? " opponent" : "");
    btn.style.left = (x - seatSize / 2) + "px";
    btn.style.top  = (y - seatSize / 2) + "px";
    btn.textContent = pos;
    btn.addEventListener("click", function () {
      handleSeatClick(pos);
    });
    table.appendChild(btn);
  });

  updatePositionHint();
}

function handleSeatClick(pos) {
  var isHero = (state.hero_position === pos);
  var oppIdx = -1;
  state.opponents.forEach(function (o, i) { if (o.position === pos) oppIdx = i; });
  var isOpp = (oppIdx !== -1);

  if (isHero) {
    // 取消 Hero
    state.hero_position = null;
  } else if (isOpp) {
    // 取消对手
    state.opponents.splice(oppIdx, 1);
  } else if (!state.hero_position) {
    // 设为 Hero
    state.hero_position = pos;
  } else {
    // 添加为对手
    state.opponents.push({ position: pos, stack_bb: "" });
  }

  renderPositionTable();
  renderPlayerList();
}

function updatePositionHint() {
  var hint = $("positionHint");
  if (!state.hero_position) {
    hint.textContent = "先点圆圈选 Hero，再点其他位置添加对手";
    hint.classList.remove("filled");
  } else if (state.opponents.length === 0) {
    hint.textContent = "Hero: " + state.hero_position + " — 点其他位置添加对手";
    hint.classList.add("filled");
  } else {
    hint.textContent = "Hero: " + state.hero_position + " + " + state.opponents.length + " 个对手";
    hint.classList.add("filled");
  }
}

function renderPlayerList() {
  var list = $("playerList");
  list.innerHTML = "";

  if (!state.hero_position && state.opponents.length === 0) {
    list.innerHTML = '<div class="player-list-hint">点击圆桌上的空位添加对手</div>';
    return;
  }

  // Hero 行
  if (state.hero_position) {
    var heroRow = document.createElement("div");
    heroRow.className = "player-row hero";
    heroRow.innerHTML =
      '<span class="player-pos">' + state.hero_position + '</span>' +
      '<span class="player-label">Hero</span>' +
      '<input class="player-stack-input" type="number" min="1" step="0.5" placeholder="100" value="' + (state.hero_stack_bb || "") + '" />' +
      '<span class="player-stack-suffix">BB</span>';
    heroRow.querySelector("input").addEventListener("input", function (e) {
      state.hero_stack_bb = e.target.value;
    });
    list.appendChild(heroRow);
  }

  // 对手行
  state.opponents.forEach(function (opp, idx) {
    var row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML =
      '<span class="player-pos">' + opp.position + '</span>' +
      '<span class="player-label">对手</span>' +
      '<input class="player-stack-input" type="number" min="1" step="0.5" placeholder="100" value="' + (opp.stack_bb || "") + '" />' +
      '<span class="player-stack-suffix">BB</span>' +
      '<button type="button" class="player-remove" data-idx="' + idx + '">✕</button>';
    row.querySelector("input").addEventListener("input", function (e) {
      state.opponents[idx].stack_bb = e.target.value;
    });
    row.querySelector(".player-remove").addEventListener("click", function () {
      state.opponents.splice(idx, 1);
      renderPositionTable();
      renderPlayerList();
    });
    list.appendChild(row);
  });
}
```

- [ ] **Step 4: 重写 form.js — Step 1 起手牌（保持不变）**

接续添加：

```js
// ===== 步骤 1: 起手牌 =====

function renderHandTip() {
  var c1 = state.hero_cards[0];
  var c2 = state.hero_cards[1];
  if (!c1 || !c2) { $("handTip").textContent = ""; return; }
  var r1 = c1[0], s1 = c1[1], r2 = c2[0], s2 = c2[1];
  var label;
  if (r1 === r2) label = r1 + r1 + "（口袋对）";
  else if (s1 === s2) label = r1 + r2 + "s（同花）";
  else label = r1 + r2 + "o（杂色）";
  $("handTip").textContent = label;
}
```

- [ ] **Step 5: 重写 form.js — Step 2 行动构建器核心**

接续添加：

```js
// ===== 步骤 2: 行动构建器 =====

function initStreetActions(street) {
  var alive;
  if (street === "preflop") {
    var preflopOrder = getPositions(state.table_type);
    alive = getActivePlayers(preflopOrder);
  } else {
    var postflopOrder = getPostflopOrder(state.table_type);
    alive = getAliveForStreet(street);
    // 按 postflop 顺序排列
    alive = postflopOrder.filter(function (pos) { return alive.indexOf(pos) !== -1; });
  }

  state.actions[street] = alive.map(function (pos) {
    var isHero = (pos === state.hero_position);
    return {
      position: isHero ? "Hero" : pos,
      action: "",
      amount: null,
    };
  });
}

function renderActionBuilder(street) {
  var containerId = street + "Builder";
  var container = $(containerId);
  if (!container) return;
  container.innerHTML = "";

  var actions = state.actions[street] || [];
  var isPreflop = (street === "preflop");
  var actionOptions = isPreflop ? PREFLOP_ACTIONS : POSTFLOP_ACTIONS;

  actions.forEach(function (act, idx) {
    var isHero = (act.position === "Hero");
    var row = document.createElement("div");
    row.className = "action-row" + (isHero ? " hero-row" : "");

    // 位置标签
    var posSpan = document.createElement("span");
    posSpan.className = "action-pos";
    posSpan.textContent = act.position;
    row.appendChild(posSpan);

    // 行动选择器
    var select = document.createElement("select");
    select.className = "action-select";
    var defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "选择…";
    select.appendChild(defaultOpt);
    actionOptions.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (act.action === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", function () {
      handleActionChange(street, idx, select.value);
    });
    row.appendChild(select);

    // 金额输入
    var amountInput = document.createElement("input");
    amountInput.className = "action-amount";
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "0.5";
    amountInput.placeholder = "BB";
    amountInput.value = act.amount != null ? act.amount : "";
    amountInput.hidden = !actionNeedsAmount(act.action);
    amountInput.addEventListener("input", function () {
      state.actions[street][idx].amount = amountInput.value !== "" ? parseFloat(amountInput.value) : null;
    });
    row.appendChild(amountInput);

    container.appendChild(row);
  });

  // "添加玩家"按钮（找回已 fold 的）
  var foldedPlayers = getFoldedPlayersForStreet(street);
  if (foldedPlayers.length > 0) {
    var addDiv = document.createElement("div");
    addDiv.className = "add-player-dropdown";
    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "add-player-btn";
    addBtn.textContent = "+ 添加玩家";
    addBtn.addEventListener("click", function () {
      toggleAddPlayerMenu(addDiv, street, foldedPlayers);
    });
    addDiv.appendChild(addBtn);
    container.appendChild(addDiv);
  }
}

function handleActionChange(street, idx, newAction) {
  var actions = state.actions[street];
  var oldAction = actions[idx].action;
  actions[idx].action = newAction;
  actions[idx].amount = null;

  // 智能追加：如果新行动是 aggressive 且旧行动不是
  if (isAggressiveAction(newAction) && !isAggressiveAction(oldAction)) {
    smartAppend(street, idx);
  }

  renderActionBuilder(street);
}

function smartAppend(street, raiserIdx) {
  var actions = state.actions[street];
  var raiserPos = actions[raiserIdx].position;
  var isPreflop = (street === "preflop");
  var order = isPreflop ? getPositions(state.table_type) : getPostflopOrder(state.table_type);

  // 获取在手的玩家（在本街中没有最终 fold 的）
  var activePlayers = getActivePlayers(order);

  // 找到 raiser 在顺序中的位置
  var raiserActualPos = raiserPos === "Hero" ? state.hero_position : raiserPos;
  var raiserOrderIdx = order.indexOf(raiserActualPos);
  if (raiserOrderIdx === -1) return;

  // 从 raiser 之后开始，绕一圈回到 raiser 之前
  var toAppend = [];
  for (var i = 1; i < order.length; i++) {
    var checkPos = order[(raiserOrderIdx + i) % order.length];
    if (checkPos === raiserActualPos) break;
    if (activePlayers.indexOf(checkPos) === -1) continue;

    // 检查该玩家在当前行动列表中 raiserIdx 之后是否已经有行动
    var isHero = (checkPos === state.hero_position);
    var label = isHero ? "Hero" : checkPos;
    var alreadyResponded = false;
    for (var j = raiserIdx + 1; j < actions.length; j++) {
      if (actions[j].position === label) {
        alreadyResponded = true;
        break;
      }
    }
    if (alreadyResponded) continue;

    // 跳过在此前行动中已 fold 的
    var hasFolded = false;
    for (var k = 0; k <= raiserIdx; k++) {
      if (actions[k].position === label && actions[k].action === "fold") {
        hasFolded = true;
      }
      if (actions[k].position === label && actions[k].action !== "fold") {
        hasFolded = false;
      }
    }
    if (hasFolded) continue;

    toAppend.push({ position: label, action: "fold", amount: null });
  }

  // 追加到行动列表末尾
  toAppend.forEach(function (a) { actions.push(a); });
}

function getFoldedPlayersForStreet(street) {
  var isPreflop = (street === "preflop");
  var order = isPreflop ? getPositions(state.table_type) : getPostflopOrder(state.table_type);
  var allActive = getActivePlayers(order);

  // 当前街已有行动的且最终 fold 的玩家
  var actions = state.actions[street] || [];
  var folded = [];
  var foldState = {};
  actions.forEach(function (a) {
    var pos = a.position === "Hero" ? state.hero_position : a.position;
    if (a.action === "fold") foldState[pos] = true;
    else delete foldState[pos];
  });

  // 也包括在之前街 fold 但可以找回的玩家
  if (!isPreflop) {
    var aliveBefore = getAliveForStreet(street);
    allActive.forEach(function (pos) {
      if (aliveBefore.indexOf(pos) === -1) {
        foldState[pos] = true;
      }
    });
  }

  Object.keys(foldState).forEach(function (pos) {
    if (foldState[pos]) {
      folded.push(pos === state.hero_position ? "Hero" : pos);
    }
  });

  return folded;
}

function toggleAddPlayerMenu(container, street, foldedPlayers) {
  var existing = container.querySelector(".add-player-menu");
  if (existing) { existing.remove(); return; }

  var menu = document.createElement("div");
  menu.className = "add-player-menu";
  foldedPlayers.forEach(function (label) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", function () {
      state.actions[street].push({ position: label, action: "", amount: null });
      renderActionBuilder(street);
    });
    menu.appendChild(btn);
  });
  container.appendChild(menu);

  // 点击外部关闭
  setTimeout(function () {
    document.addEventListener("click", function handler(e) {
      if (!container.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", handler);
      }
    });
  }, 0);
}

function renderStreetVisibility() {
  ["flop", "turn", "river"].forEach(function (s) {
    var pane = document.querySelector('.street-pane[data-street="' + s + '"]');
    var addBtn = document.querySelector('.street-add[data-add="' + s + '"]');
    var open = state[s + "_open"];
    pane.hidden = !open;
    addBtn.hidden = open;
  });
  var turnAdd = document.querySelector('.street-add[data-add="turn"]');
  var riverAdd = document.querySelector('.street-add[data-add="river"]');
  var flopAdd = document.querySelector('.street-add[data-add="flop"]');
  if (!state.flop_open) flopAdd.hidden = false;
  turnAdd.hidden = !state.flop_open || state.turn_open;
  riverAdd.hidden = !state.turn_open || state.river_open;
}

function bindStreetToggles() {
  $$(".street-add").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var s = btn.dataset.add;
      state[s + "_open"] = true;
      // 自动初始化该街行动行
      initStreetActions(s);
      renderStreetVisibility();
      renderActionBuilder(s);
    });
  });
  $$(".street-remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var s = btn.dataset.remove;
      state[s + "_open"] = false;
      if (s === "flop")  { state.turn_open = false; state.river_open = false; }
      if (s === "turn")  { state.river_open = false; }
      // 清空数据
      if (s === "flop")  { state.flop_cards = [null, null, null]; state.actions.flop = []; }
      if (s === "turn")  { state.turn_card = [null];  state.actions.turn = []; }
      if (s === "river") { state.river_card = [null]; state.actions.river = []; }
      renderAllSlots();
      renderStreetVisibility();
    });
  });
}
```

- [ ] **Step 6: 重写 form.js — Step 3 结果 + 通用 card-slot + 选牌器**

接续添加：

```js
// ===== 步骤 3: 结果 =====

function bindResultStepper() {
  $$(".result-sign").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sign = parseInt(btn.dataset.sign, 10);
      var input = $("resultBB");
      var v = parseFloat(input.value);
      if (isNaN(v) || v === 0) { input.focus(); return; }
      input.value = (sign * Math.abs(v)).toString();
      state.result_bb = input.value;
    });
  });
  $("resultBB").addEventListener("input", function (e) { state.result_bb = e.target.value; });
  ["opponentNotes", "notes"].forEach(function (id) {
    $(id).addEventListener("input", function (e) {
      var key = id === "opponentNotes" ? "opponent_notes" : "notes";
      state[key] = e.target.value;
    });
  });
  $("oppClear").addEventListener("click", function () {
    state.showdown_opp_cards = [null, null];
    renderAllSlots();
  });
}

// ===== 通用 card-slot 渲染 =====

function renderCardSlot(btn) {
  var target = btn.dataset.target;
  var slot = targetSlot(target);
  var card = slot.arr[slot.idx];
  if (card) {
    var rank = card[0];
    var suit = card[1];
    var glyph = { s: "♠", h: "♥", d: "♦", c: "♣" }[suit];
    var redClass = (suit === "h" || suit === "d") ? " red" : " black";
    btn.innerHTML = '<span class="card-face' + redClass + '"><span class="cf-rank">' + rank + '</span><span class="cf-suit">' + glyph + '</span></span>';
    btn.classList.add("filled");
  } else {
    var ph = btn.querySelector(".card-slot-placeholder");
    var phText = ph ? ph.textContent : "card";
    btn.innerHTML = '<span class="card-slot-placeholder">' + phText + '</span>';
    btn.classList.remove("filled");
  }
}

function renderAllSlots() {
  $$(".card-slot").forEach(renderCardSlot);
  renderHandTip();
}

function bindCardSlots() {
  $$(".card-slot").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openCardPicker(btn.dataset.target);
    });
  });
  $("heroClear").addEventListener("click", function () {
    state.hero_cards = [null, null];
    renderAllSlots();
  });
}

// ===== 选牌器 =====

function buildRankGrid() {
  var grid = $("rankGrid");
  grid.innerHTML = "";
  var ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  ranks.forEach(function (r) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = r;
    b.addEventListener("click", function () {
      pickerRank = r;
      $("pickedRank").textContent = "→ " + r;
      $$("#rankGrid button").forEach(function (x) { x.classList.toggle("active", x.textContent === r); });
    });
    grid.appendChild(b);
  });
}

function bindSuitGrid() {
  $$("#suitGrid button").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!pickerRank) { showToast("先选点数"); return; }
      var card = pickerRank + b.dataset.suit;
      if (!pickerTarget) return;
      if (isCardUsed(card, pickerTarget)) {
        showToast(card + " 已被其他位置占用");
        return;
      }
      var slot = targetSlot(pickerTarget);
      slot.arr[slot.idx] = card;
      var prevTarget = pickerTarget;
      closeCardPicker();
      renderAllSlots();
      if (prevTarget === "hero:0" && !state.hero_cards[1]) {
        setTimeout(function () { openCardPicker("hero:1"); }, 120);
      } else if (prevTarget === "flop:0" && !state.flop_cards[1]) {
        setTimeout(function () { openCardPicker("flop:1"); }, 120);
      } else if (prevTarget === "flop:1" && !state.flop_cards[2]) {
        setTimeout(function () { openCardPicker("flop:2"); }, 120);
      } else if (prevTarget === "opp:0" && !state.showdown_opp_cards[1]) {
        setTimeout(function () { openCardPicker("opp:1"); }, 120);
      }
    });
  });
}

function isCardUsed(card, exceptTarget) {
  var groups = [
    ["hero:0", state.hero_cards[0]],
    ["hero:1", state.hero_cards[1]],
    ["flop:0", state.flop_cards[0]],
    ["flop:1", state.flop_cards[1]],
    ["flop:2", state.flop_cards[2]],
    ["turn:0", state.turn_card[0]],
    ["river:0", state.river_card[0]],
    ["opp:0", state.showdown_opp_cards[0]],
    ["opp:1", state.showdown_opp_cards[1]],
  ];
  return groups.some(function (g) { return g[1] === card && g[0] !== exceptTarget; });
}

function openCardPicker(target) {
  pickerTarget = target;
  pickerRank = null;
  var label = {
    "hero:0": "起手牌 · 第 1 张", "hero:1": "起手牌 · 第 2 张",
    "flop:0": "翻牌 · 第 1 张", "flop:1": "翻牌 · 第 2 张", "flop:2": "翻牌 · 第 3 张",
    "turn:0": "转牌", "river:0": "河牌",
    "opp:0": "对手底牌 · 第 1 张", "opp:1": "对手底牌 · 第 2 张",
  }[target] || "选张牌";
  $("cardPickerTitle").textContent = label;
  $("pickedRank").textContent = "";
  $$("#rankGrid button").forEach(function (x) { x.classList.remove("active"); });
  $("cardPickerMask").hidden = false;
  $("cardPickerSheet").hidden = false;
}

function closeCardPicker() {
  pickerTarget = null;
  pickerRank = null;
  $("cardPickerMask").hidden = true;
  $("cardPickerSheet").hidden = true;
}
```

- [ ] **Step 7: 重写 form.js — 提交逻辑 + 初始化**

接续添加：

```js
// ===== 提交 =====

function serializeActionsToText(actionsArr) {
  if (!actionsArr || actionsArr.length === 0) return "";
  return actionsArr.map(function (a) {
    var text = a.position + " " + a.action;
    if (a.amount != null) text += " " + a.amount;
    return text;
  }).join("，");
}

function buildPayload() {
  function joinCards(arr) {
    var cs = arr.filter(Boolean);
    return cs.length ? cs.join(" ") : null;
  }

  var effectiveStack = state.hero_stack_bb !== "" ? parseFloat(state.hero_stack_bb) : null;

  // 构建 opponents JSON
  var opponents = state.opponents.map(function (o) {
    return {
      position: o.position,
      stack_bb: o.stack_bb !== "" ? parseFloat(o.stack_bb) : null,
    };
  });

  // 构建 actions JSON
  var actions = {
    preflop: state.actions.preflop.filter(function (a) { return a.action; }),
  };
  if (state.flop_open) actions.flop = state.actions.flop.filter(function (a) { return a.action; });
  if (state.turn_open) actions.turn = state.actions.turn.filter(function (a) { return a.action; });
  if (state.river_open) actions.river = state.actions.river.filter(function (a) { return a.action; });

  return {
    blind_level: state.blind_level,
    table_type: state.table_type,
    hero_position: state.hero_position,
    hero_cards: state.hero_cards.filter(Boolean).join(" "),
    effective_stack_bb: effectiveStack,
    opponents: opponents,
    actions: actions,
    // 文本版本（向后兼容）
    preflop_actions: serializeActionsToText(actions.preflop),
    flop_cards:   state.flop_open  ? joinCards(state.flop_cards)  : null,
    flop_actions: state.flop_open  ? (serializeActionsToText(actions.flop) || null) : null,
    turn_card:    state.turn_open  ? (state.turn_card[0] || null) : null,
    turn_actions: state.turn_open  ? (serializeActionsToText(actions.turn) || null) : null,
    river_card:   state.river_open ? (state.river_card[0] || null) : null,
    river_actions:state.river_open ? (serializeActionsToText(actions.river) || null) : null,
    result_bb:    state.result_bb !== "" ? parseFloat(state.result_bb) : null,
    showdown_opp_cards: state.showdown_opp_cards.filter(Boolean).length === 2
      ? state.showdown_opp_cards.join(" ") : null,
    opponent_notes: state.opponent_notes.trim() || null,
    notes: state.notes.trim() || null,
    played_at: state.played_at || null,
  };
}

async function submit() {
  var settings = getSettings();
  var apiKey = getApiKeyForModel(settings.model);
  if (!apiKey) {
    showToast("请先在设置页配置 API Key");
    setTimeout(function () { window.location.href = "/poker/profile.html"; }, 1500);
    return;
  }
  var btn = $("nextBtn");
  btn.disabled = true;
  btn.textContent = "保存中…";
  try {
    var resp = await fetch("/api/poker/hands", {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(buildPayload()),
    });
    if (!resp.ok) {
      var err = await resp.json();
      throw new Error(err.error || "保存失败");
    }
    var data = await resp.json();
    window.location.href = "/poker/analysis.html?hand_id=" + data.hand_id + "&auto=1";
  } catch (err) {
    showToast(err.message || "保存失败，请重试");
    btn.disabled = false;
    btn.textContent = "保存并分析";
  }
}

// ===== 初始化 =====

function refreshAll() {
  renderBlindChips();
  renderTableSeg();
  renderPositionTable();
  renderPlayerList();
  renderStreetVisibility();
  renderAllSlots();
  // 渲染所有已打开街道的行动构建器
  ["preflop", "flop", "turn", "river"].forEach(function (s) {
    if (s === "preflop" || state[s + "_open"]) {
      renderActionBuilder(s);
    }
  });
}

(function init() {
  var today = new Date().toISOString().slice(0, 10);
  $("playedAt").value = today;
  state.played_at = today;
  $("playedAt").addEventListener("input", function (e) { state.played_at = e.target.value; });

  bindBlindChips();
  bindTableSeg();
  bindStreetToggles();
  bindResultStepper();
  bindCardSlots();
  buildRankGrid();
  bindSuitGrid();

  $("cardPickerClose").addEventListener("click", closeCardPicker);
  $("cardPickerMask").addEventListener("click", closeCardPicker);

  $("prevBtn").addEventListener("click", prevStep);
  $("nextBtn").addEventListener("click", nextStep);

  $$(".wizard-step").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = parseInt(el.dataset.idx, 10);
      if (target <= state.step) { gotoStep(target); return; }
      for (var i = state.step; i < target; i++) {
        var err = validateStep(i);
        if (err) { showToast(err); return; }
      }
      gotoStep(target);
    });
  });

  gotoStep(0);
}());
```

- [ ] **Step 8: 手动验证**

Run: `cd D:\Cursor_Projects\mini-cloud && pnpm dev`

在浏览器打开 `http://localhost:3000/poker/form.html`，验证：

1. 默认桌型为 9-Max，渲染 9 个座位
2. 点击座位先选 Hero，再点其他位置标记对手，座位显示琥珀色
3. 圆桌下方出现玩家列表（Hero + 对手各一行，带筹码输入）
4. 点击已标记的对手座位可取消
5. 进入 Step 2，自动按翻前顺序生成行动行
6. 选择 raise 后自动追加后续玩家行动行
7. 点 "+ 翻牌 Flop" 展开 flop 区域（含卡牌槽 + 行动行）
8. 已 fold 的玩家不出现在后续街
9. "+ 添加玩家" 可找回已 fold 玩家
10. 保存提交成功

- [ ] **Step 9: 提交**

```bash
git add backend/demo/poker-coach/js/form.js
git commit -m "feat(poker): 重写 form.js — 对手标记 + 结构化行动构建器"
```

---

### Task 8: 最终验证与合并提交

- [ ] **Step 1: 启动后端完整验证**

Run: `cd D:\Cursor_Projects\mini-cloud && pnpm dev`

完整流程测试：
1. 打开 `/poker/form.html`
2. 选盲注 → 选桌型（默认 9max）→ 选 Hero → 标记 2-3 个对手并输入筹码
3. 选起手牌
4. 在行动步骤：填写 preflop 行动 → 展开 flop → 填 flop 行动 → 展开 turn
5. 填写结果 → 保存并分析
6. 验证 analysis 页面能正常展示

- [ ] **Step 2: 确认无遗留问题后收尾**

如果所有验证通过，完成。
