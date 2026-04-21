# 冒险游戏 API

## 概述

冒险游戏 API 提供 AI 驱动的互动冒险故事生成能力，支持 **50+ 场景、跨天续玩** 的长篇冒险。

**核心架构**：
- MySQL 虚拟文件树作为记忆载体（角色档案、章节摘要等）
- 每轮从 `advance_story` 的 `memory_updates` 字段自动抽取落库
- `enhancePrompt` 钩子装配分层上下文注入 system prompt
- 章节制进度（chapter 1-5，beat 1-10）替代原有 progress 1-10

**交互形态**：世界观初选为按钮式，进入故事后由玩家**自由文本输入**推动情节。文生图由路由层异步触发，不阻塞叙述返回。

---

## 端点

### POST `/api/adventure/completions`

AI 冒险故事对话（SSE 流式）。

#### 请求头

| 字段 | 必填 | 说明 |
|------|------|------|
| `Content-Type` | 是 | `application/json` |
| `X-Api-Key` | 是 | LLM 厂商 API Key（同时用于文生图） |
| `X-Anon-Token` | 是* | 匿名用户标识（H5 Demo 必填，小程序通过 `x-wx-openid` 自动注入） |
| `X-Image-Api-Key` | 否 | 文生图专用 API Key（不传则复用 X-Api-Key） |

*H5 Demo 由前端 `storage.js` 的 `getAnonToken()` 自动生成并持久化。

#### 请求体

```json
{
  "story_id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
  "messages": [
    { "role": "user", "content": "我纵身跃上屋顶，追那黑衣人" }
  ],
  "model": "qwen3.5-plus",
  "context": {
    "worldSetting": "江湖乱世，各大门派明争暗斗",
    "goal": "追查师父被毒杀的真凶，在三月之内为其昭雪报仇",
    "chapter": 2,
    "beat": 5,
    "characterProfile": {
      "name": "凌云",
      "roleType": ["孤傲剑客", "侠义英雄"],
      "tone": ["热血冒险", "复仇雪恨"]
    },
    "playerAge": 25,
    "currentStats": {
      "strength": 5,
      "speed": 7,
      "neili": 4,
      "qinggong": 6,
      "defense": 4,
      "wisdom": 5
    }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `story_id` | String | 否 | 续玩时必填。缺省则创建新档，服务端通过 `story_created` 事件返回新 ID |
| `messages` | Array | 是 | 对话消息数组。前端只传最近 K=6 条交互（12 条消息），服务端已从 DB 补全长期记忆 |
| `model` | String | 否 | 模型 ID，默认 `qwen3.5-plus` |
| `context.worldSetting` | String | 否 | 当前世界观（服务端从 DB 加载优先） |
| `context.goal` | String | 否 | 本局目标（服务端从 DB 加载优先） |
| `context.chapter` | Number | 否 | 当前章节（服务端从 DB 加载优先） |
| `context.beat` | Number | 否 | 当前节拍（服务端从 DB 加载优先） |
| `context.characterProfile` | Object | 否 | 玩家档案（服务端从 DB 加载优先）；字段：`name`、`roleType`（武侠角色类型数组）、`tone`（故事类型数组） |
| `context.playerAge` | Number | 否 | 玩家年龄（供 AI 设定主角年龄段） |
| `context.currentStats` | Object | 否 | 当前角色属性（`strength/speed/neili/qinggong/defense/wisdom`），供属性成长判定 |

#### SSE 响应事件

##### `story_created` — 新存档创建（新）

```json
{ "type": "story_created", "story_id": "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx" }
```

当 `story_id` 未传时（新游戏）首先下发，前端应保存此 ID 用于后续续玩。

##### `narrative_delta` — 叙述文本流式片段

```json
{ "type": "narrative_delta", "content": "你站在" }
```

##### `thinking` — AI 推理中

```json
{
  "type": "thinking",
  "iteration": 1,
  "tool_calls": [{ "name": "advance_story", "arguments": "{...}" }]
}
```

##### `tool_result` — 工具执行结果

```json
{
  "type": "tool_result",
  "name": "advance_story",
  "result": {
    "success": true,
    "narrative": "你站在一片古老的森林边缘...",
    "chapter": 2,
    "beat": 3,
    "is_chapter_end": false,
    "progress": 3,
    "choices": [{ "id": "hint1", "text": "深入密林" }],
    "is_ending": false,
    "title": null,
    "image_prompt": null,
    "memory_updates": [
      { "op": "upsert", "path": "/characters/goblin-chief.md", "node_type": "character", "content": "哥布林酋长..." }
    ]
  }
}
```

##### `story_saved` — 场景已落库（新）

```json
{ "type": "story_saved", "story_id": "xxx", "scene_seq": 5 }
```

##### `memory_updated` — 记忆文件已更新（新）

```json
{ "type": "memory_updated", "count": 2 }
```

##### `chapter_compacted` — 章节摘要生成完成（新）

```json
{ "type": "chapter_compacted", "chapter": 2 }
```

异步，可能在 `[DONE]` 之后到达（章节压缩 LLM 调用耗时约 10-30s）。

##### `scene_image_pending` — 图片生成已开始

```json
{ "type": "scene_image_pending", "turn_id": 1 }
```

##### `scene_image` — 图片生成成功

```json
{ "type": "scene_image", "turn_id": 1, "url": "https://..." }
```

##### `scene_image_error` — 图片生成失败

```json
{ "type": "scene_image_error", "turn_id": 1, "message": "图像生成失败" }
```

##### `awakening_event` — 前世记忆觉醒（轮回系统）

```json
{ "type": "awakening_event", "trigger": { "fragments_shown": ["..."], "stat_bonus": { "neili": 1 } } }
```

仅当 AI 触发 `awakening_trigger` 字段时下发，整局最多一次（第 2 章中段）。

##### `answer` — 最终回复

```json
{ "type": "answer", "content": "故事已推进" }
```

##### `error` — 错误

```json
{ "type": "error", "message": "错误描述" }
```

流结束标记：`data: [DONE]\n\n`

> **事件顺序**：`story_created`（新档）→ `narrative_delta`（多次）→ `thinking` → `tool_result` → `awakening_event`（若觉醒触发）→ `scene_image_pending`（若有图）→ `story_saved`（异步）→ `memory_updated`（若有，异步）→ `answer` → `scene_image`（异步）→ `chapter_compacted`（若章末）→ `[DONE]`
>
> 注：`awakening_event` 与 `scene_image_pending` 在 `tool_result` 后同步发送；`story_saved`、`memory_updated` 由异步 DB 任务写入，通常在 `answer` 前到达，但不保证顺序。

---

### GET `/api/adventure/stories`

获取用户存档列表（按最近游玩时间倒序）。

#### 请求头

`X-Anon-Token` 或 `x-wx-openid`（必填）

#### 查询参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `limit` | 20 | 每页数量（最大 50） |
| `offset` | 0 | 分页偏移 |

#### 响应

```json
{
  "stories": [
    {
      "story_id": "xxx",
      "title": "血刀门的秘辛",
      "status": "active",
      "current_chapter": 2,
      "current_beat": 5,
      "scene_count": 15,
      "world_setting": "江湖乱世，各大门派明争暗斗",
      "goal": "追查师父被毒杀的真凶，在三月之内为其昭雪报仇",
      "character_profile": { "name": "凌云", "roleType": ["孤傲剑客"], "tone": ["热血冒险"] },
      "last_played_at": "2026-04-15T10:30:00.000Z",
      "created_at": "2026-04-14T08:00:00.000Z"
    }
  ]
}
```

---

### GET `/api/adventure/stories/:id`

获取单个故事详情（含近期场景，用于恢复游戏）。

#### 请求头

`X-Anon-Token` 或 `x-wx-openid`（必填）

#### 响应

```json
{
  "story": {
    "story_id": "xxx",
    "title": "血刀门的秘辛",
    "status": "active",
    "current_chapter": 2,
    "current_beat": 5,
    "world_setting": "江湖乱世，各大门派明争暗斗",
    "goal": "追查师父被毒杀的真凶，在三月之内为其昭雪报仇",
    "character_profile": { "name": "凌云", "roleType": ["孤傲剑客"], "tone": ["热血冒险"] }
  },
  "recentScenes": [
    {
      "seq": 14,
      "chapter": 2,
      "beat": 4,
      "player_action": "我纵身跃上屋顶，追那黑衣人",
      "narrative": "你脚尖轻点，借力一跃...",
      "choices": [],
      "image_url": null,
      "is_ending": false
    }
  ]
}
```

`recentScenes` 最多返回 12 个场景（6 轮对话），按 seq 正序排列，用于前端重建消息历史。

---

## 工具说明

### `advance_story`

**字段输出顺序（必须严格遵守）**：
`narrative → chapter → beat → is_chapter_end → progress → goal → choices → is_ending → title → image_prompt → memory_updates → stat_delta → awakening_trigger → legacy`

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `narrative` | String | 是 | 故事叙述文本（中文，200-400 字）。**第一个字段** |
| `chapter` | Number | 是 | 当前章节（1-5） |
| `beat` | Number | 是 | 当前章内节拍（1-10），同时作为 progress |
| `is_chapter_end` | Boolean | 否 | 是否为章末（触发异步章节压缩） |
| `progress` | Number | 否 | 与 beat 一致（供前端进度条使用） |
| `goal` | String | 否 | 本局目标（**仅第一轮背景介绍时必填**，15-40 字中文） |
| `choices` | Array | 否 | 见下文"语义"说明 |
| `is_ending` | Boolean | 否 | 是否为结局。**仅 chapter=5 && beat>=9 时允许** |
| `title` | String | 否 | 故事标题（世界观确定后首场景设置） |
| `image_prompt` | String | 否 | 英文图片描述，**仅开局和结局填写** |
| `memory_updates` | Array | 否 | 记忆文件更新（每轮最多 3 条） |
| `stat_delta` | Object | 否 | 本轮属性变化（`strength/speed/neili/qinggong/defense/wisdom/exp`，每项绝对值 1-2；`skill_unlock` 仅关键突破时填写） |
| `awakening_trigger` | Object | 否 | 前世记忆觉醒（整局最多一次，第 2 章中段）；含 `fragments_shown`（数组）和可选 `stat_bonus` |
| `legacy` | Object | 否 | 本世遗产（**仅 is_ending=true 时填写**）；含 `lifespan`、`fragments`（3-5 条）、`peak_stats` |

**`choices` 字段语义：**

- **第一轮（背景介绍）**：**必须留空**
- **后续轮次**：不是菜单，是"灵感提示"（0-2 条），id 用 `hint1/hint2`，不需要 `goal`
- **结局时**：不提供

**`memory_updates` 字段：**

```json
[
  { "op": "upsert", "path": "/characters/alice.md", "node_type": "character", "content": "Alice 是一名精灵弓手..." },
  { "op": "append", "path": "/scratch.md", "content": "发现了地图碎片" },
  { "op": "archive", "path": "/items/broken-sword.md" }
]
```

- 支持操作：`upsert`（创建/覆盖）、`append`（追加）、`archive`（软删除）
- 角色首次出场必须 upsert 其档案
- 不允许修改 `/world.md` 和 `/goal.md`（系统 pinned 文件）

**图片生成规则：**

路由层只在以下两种 `tool_result` 上触发文生图：
1. `result.title` 非空（开局后的首个场景）
2. `result.is_ending === true`（结局场景）

整局游戏共 **2 张图片**（开局图 + 结局图）。

---

## 记忆系统说明

### 分层上下文装配

每轮请求前，服务端从 DB 加载并注入到 system prompt：

| 层级 | 内容 | 策略 |
|------|------|------|
| Pinned 核心 | `/world.md`、`/goal.md` | 全文 |
| 近期实体 | 最近出场的角色/物品/地点 | 全文 |
| 历史实体 | 早期角色/物品/地点 | 仅首行摘要 |
| 章节摘要 | `/plot/chapter-N.md` | 全文 |
| 临时笔记 | `/scratch.md` | 首行摘要 |
| 记忆索引 | 所有文件路径+大小 | system prompt 末尾 `<memory>` 块 |

### 章节压缩

章末（`is_chapter_end=true`）触发：
1. 锁定 `compaction_pending_until`（5 分钟）
2. 读取章内所有场景 narrative
3. 调用 LLM 生成 ≤600 字摘要
4. 存入 `/plot/chapter-N.md`

**降级**：压缩完成前章节摘要文件尚未写入 DB，`assembleContext` 加载不到该章摘要，自动退化为 recentK 窗口内的近期原文场景，不影响其他层级的记忆注入。
