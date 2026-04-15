# 冒险游戏数据库设计

## 环境变量

与财务助理共用同一 MySQL 实例：`MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`（默认 `mini_cloud`）。

## 表结构

### adventure_stories — 故事元数据

| 字段 | 类型 | 说明 |
|------|------|------|
| `story_id` | VARCHAR(36) PK | UUID |
| `user_token` | VARCHAR(128) NOT NULL | 用户标识（微信 openid 或匿名 UUID） |
| `title` | VARCHAR(100) | 故事标题（世界观确定后首场景设置） |
| `status` | ENUM('active','ended') | 故事状态，默认 active |
| `current_chapter` | TINYINT UNSIGNED | 当前章节（1-5），默认 1 |
| `current_beat` | TINYINT UNSIGNED | 当前章内节拍（1-10），默认 1 |
| `scene_count` | SMALLINT UNSIGNED | 累计场景数（用于生成下一场景 seq），默认 0 |
| `world_setting` | VARCHAR(500) | 世界观文本 |
| `goal` | VARCHAR(200) | 本局目标 |
| `character_profile` | JSON | 玩家档案（name/genre/roleType/tone） |
| `compaction_pending_until` | DATETIME | 章末压缩任务预计完成时间（降级判断） |
| `lock_token` | VARCHAR(36) | 并发锁令牌 |
| `lock_expires_at` | DATETIME | 并发锁过期时间（防崩溃死锁，2 分钟） |
| `last_played_at` | DATETIME | 最近游玩时间 |
| `created_at` | DATETIME | 创建时间（Sequelize 自动维护） |
| `updated_at` | DATETIME | 更新时间（Sequelize 自动维护） |

**索引**：`idx_adv_stories_user_time` (user_token, last_played_at)

---

### adventure_memory_files — 虚拟文件树

每个故事拥有独立的虚拟文件树，AI 每轮通过 `memory_updates` 字段维护。

| 字段 | 类型 | 说明 |
|------|------|------|
| `story_id` | VARCHAR(36) PK | 所属故事 ID |
| `path` | VARCHAR(200) PK | 虚拟路径（复合主键） |
| `node_type` | ENUM | world/goal/character/item/location/chapter/scratch |
| `content` | TEXT | 文件内容（4KB 硬上限） |
| `version` | INT UNSIGNED | 版本号（乐观锁），默认 1 |
| `pinned` | BOOLEAN | 始终注入到 system prompt（默认 false） |
| `last_scene_seq` | SMALLINT UNSIGNED | 最后一次更新时的场景序号（相关性筛选） |
| `deleted_at` | DATETIME | 软删除时间（archive 操作），NULL 表示有效 |
| `created_at` | DATETIME | 创建时间 |
| `updated_at` | DATETIME | 更新时间 |

**路径约定**：
- `/world.md`（node_type=world，pinned=true）— 世界观，开局自动创建
- `/goal.md`（node_type=goal，pinned=true）— 本局目标，开局自动创建
- `/characters/<name>.md`（character）— 角色档案，角色首次出场时创建
- `/items/<id>.md`（item）— 关键物品
- `/locations/<id>.md`（location）— 重要地点
- `/plot/chapter-<n>.md`（chapter）— 章节摘要，章末异步生成
- `/scratch.md`（scratch）— 临时笔记（伏笔、待解谜题）

**索引**：
- `idx_adv_mem_story_type` (story_id, node_type)
- `idx_adv_mem_pinned` (story_id, pinned, deleted_at)

---

### adventure_scenes — 场景记录

| 字段 | 类型 | 说明 |
|------|------|------|
| `story_id` | VARCHAR(36) PK | 所属故事 ID |
| `seq` | SMALLINT UNSIGNED PK | 场景序号（从 1 开始，复合主键） |
| `chapter` | TINYINT UNSIGNED | 所在章节（1-5） |
| `beat` | TINYINT UNSIGNED | 章内节拍（1-10） |
| `player_action` | TEXT | 触发本场景的玩家输入（用于对话历史重建） |
| `narrative` | TEXT NOT NULL | AI 叙述文本 |
| `choices` | JSON | 灵感提示或世界观选项 |
| `image_url` | VARCHAR(1000) | 场景背景图 URL |
| `image_prompt` | VARCHAR(500) | 文生图提示词（仅开局和结局） |
| `is_ending` | BOOLEAN | 是否为故事结局 |
| `created_at` | DATETIME | 创建时间 |

**索引**：`idx_adv_scene_chapter` (story_id, chapter, seq)

---

### adventure_token_usage — Token 用量明细

记录每次 LLM 调用的 token 消耗，用于成本分析。每个对话轮次对应一条记录（汇总该轮所有 LLM 迭代），章节压缩单独记录。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INT UNSIGNED PK AUTO_INCREMENT | 自增主键 |
| `story_id` | VARCHAR(36) NOT NULL | 所属故事 ID |
| `scene_seq` | SMALLINT UNSIGNED | 关联场景序号；章节压缩时为 NULL |
| `usage_type` | ENUM('chat','compact') | chat=对话轮次，compact=章节压缩 |
| `model` | VARCHAR(64) NOT NULL | 使用的模型 ID（如 qwen3.5-plus） |
| `input_tokens` | INT UNSIGNED NOT NULL | 输入 token 数（prompt_tokens 累计） |
| `output_tokens` | INT UNSIGNED NOT NULL | 输出 token 数（completion_tokens 累计） |
| `cached_tokens` | INT UNSIGNED | 缓存命中 token 数（提供商支持时记录，否则为 NULL） |
| `created_at` | DATETIME | 记录创建时间 |

**索引**：`idx_adv_token_story_time` (story_id, created_at)

**成本分析示例 SQL**：
```sql
-- 查询单个故事的总 token 消耗
SELECT
  usage_type,
  model,
  SUM(input_tokens)  AS total_input,
  SUM(output_tokens) AS total_output,
  SUM(cached_tokens) AS total_cached,
  COUNT(*)           AS call_count
FROM adventure_token_usage
WHERE story_id = ?
GROUP BY usage_type, model;

-- 查询所有故事按消耗排行
SELECT
  story_id,
  SUM(input_tokens + output_tokens) AS total_tokens,
  COUNT(*) AS call_count
FROM adventure_token_usage
GROUP BY story_id
ORDER BY total_tokens DESC;
```

---

## 并发控制

同一 story_id 同时只允许一个 completions 请求处理。

**锁获取**（原子 UPDATE）：
```sql
UPDATE adventure_stories
SET lock_token = ?, lock_expires_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE)
WHERE story_id = ?
AND (lock_token IS NULL OR lock_expires_at < NOW());
```
返回 `affectedRows > 0` 则获取成功，否则返回 409。

**锁释放**（请求结束时）：
```sql
UPDATE adventure_stories
SET lock_token = NULL, lock_expires_at = NULL
WHERE story_id = ? AND lock_token = ?;
```

---

## 场景 seq 生成

使用 `scene_count` 字段原子自增（事务内）：
1. `UPDATE adventure_stories SET scene_count = scene_count + 1 WHERE story_id = ?`
2. 读取更新后的 `scene_count` 作为新场景的 `seq`

---

## 章节压缩流程

1. `is_chapter_end=true` 时 fire-and-forget 触发 `memory.compactChapter()`
2. 设置 `compaction_pending_until = NOW() + 5 minutes` 标记进行中
3. 调用 LLM 读取该章所有 scene.narrative，生成 ≤600 字摘要
4. 存入 `/plot/chapter-N.md`（upsertMemoryFile）
5. 清除 `compaction_pending_until`

**降级**：若 `compaction_pending_until > NOW()`，`assembleContext` 跳过该章摘要，使用近期原文场景替代。

---

## 记忆文件 4KB 上限

`dao.js` 中 `clampContent()` 在写入前将 content 截断到 4096 字节（UTF-8）。
