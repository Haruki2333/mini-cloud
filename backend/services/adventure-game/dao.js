/**
 * 冒险游戏 — 数据访问层
 *
 * 提供故事、场景、记忆文件的 CRUD 操作。
 * 全部通过 models.js 的 getter 延迟获取模型（保证 initDB 后才访问）。
 */

const models = require("./models");

// ===== 工具函数 =====

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 截断内容以满足 4KB 上限 */
function clampContent(content) {
  const MAX_BYTES = 4096;
  if (!content) return "";
  const buf = Buffer.from(content, "utf8");
  if (buf.length <= MAX_BYTES) return content;
  return buf.slice(0, MAX_BYTES).toString("utf8");
}

// ===== Story =====

/**
 * 创建新故事
 * @param {{ userToken: string, characterProfile?: object }} data
 * @returns {Promise<string>} story_id
 */
async function createStory({ userToken, characterProfile }) {
  const storyId = generateUUID();
  await models.AdventureStory.create({
    story_id: storyId,
    user_token: userToken,
    character_profile: characterProfile || null,
    last_played_at: new Date(),
  });
  return storyId;
}

/**
 * 加载故事（带权限校验）
 * @param {string} storyId
 * @param {string} userToken
 * @returns {Promise<object|null>}
 */
async function loadStory(storyId, userToken) {
  const story = await models.AdventureStory.findOne({
    where: { story_id: storyId, user_token: userToken },
  });
  return story ? story.toJSON() : null;
}

/**
 * 列出用户的故事列表（按最近游玩时间倒序）
 * @param {string} userToken
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<object[]>}
 */
async function listStories(userToken, { limit = 20, offset = 0 } = {}) {
  const rows = await models.AdventureStory.findAll({
    where: { user_token: userToken },
    order: [["last_played_at", "DESC"]],
    limit,
    offset,
    attributes: [
      "story_id",
      "title",
      "status",
      "current_chapter",
      "current_beat",
      "scene_count",
      "world_setting",
      "goal",
      "character_profile",
      "last_played_at",
      "created_at",
    ],
  });
  return rows.map((r) => r.toJSON());
}

/**
 * 更新故事进度与元数据
 * @param {string} storyId
 * @param {{ chapter?: number, beat?: number, title?: string, worldSetting?: string, status?: string, characterProfile?: object }} data
 */
async function updateStoryProgress(storyId, data) {
  const update = { last_played_at: new Date() };
  if (data.chapter != null) update.current_chapter = data.chapter;
  if (data.beat != null) update.current_beat = data.beat;
  if (data.title) update.title = data.title;
  if (data.worldSetting) update.world_setting = data.worldSetting;
  if (data.status) update.status = data.status;
  if (data.characterProfile) update.character_profile = data.characterProfile;
  await models.AdventureStory.update(update, { where: { story_id: storyId } });
}

// ===== 并发锁 =====

/**
 * 尝试获取故事锁（防止同一故事同时进行两个请求）
 * @param {string} storyId
 * @param {string} lockToken
 * @returns {Promise<boolean>} 是否成功获取锁
 */
async function acquireLock(storyId, lockToken) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 分钟后过期

  // 使用原子 UPDATE：仅在无锁或锁已过期时设置
  const { getSequelize } = require("../core/db");
  const sequelize = getSequelize();
  const { Op } = require("sequelize");

  const [affected] = await models.AdventureStory.update(
    { lock_token: lockToken, lock_expires_at: expiresAt },
    {
      where: {
        story_id: storyId,
        [Op.or]: [
          { lock_token: null },
          { lock_expires_at: { [Op.lt]: now } },
        ],
      },
    }
  );
  return affected > 0;
}

/**
 * 释放故事锁
 * @param {string} storyId
 * @param {string} lockToken
 */
async function releaseLock(storyId, lockToken) {
  await models.AdventureStory.update(
    { lock_token: null, lock_expires_at: null },
    { where: { story_id: storyId, lock_token: lockToken } }
  );
}

// ===== Scene =====

/**
 * 追加场景（事务内自增 seq）
 * @param {string} storyId
 * @param {{ chapter: number, beat: number, playerAction: string|null, narrative: string, choices: Array, imagePrompt: string|null, isEnding: boolean }} data
 * @returns {Promise<number>} 新场景的 seq
 */
async function appendScene(storyId, data) {
  const { getSequelize } = require("../core/db");
  const sequelize = getSequelize();

  return await sequelize.transaction(async (t) => {
    // 使用 story.scene_count 自增来生成 seq，避免并发冲突
    const [updated] = await models.AdventureStory.update(
      { scene_count: sequelize.literal("scene_count + 1") },
      { where: { story_id: storyId }, transaction: t }
    );
    if (!updated) throw new Error("故事不存在: " + storyId);

    const story = await models.AdventureStory.findOne({
      attributes: ["scene_count"],
      where: { story_id: storyId },
      transaction: t,
    });
    const seq = story.scene_count; // 自增后的值即为新 seq

    await models.AdventureScene.create(
      {
        story_id: storyId,
        seq,
        chapter: data.chapter || 1,
        beat: data.beat || 1,
        player_action: data.playerAction || null,
        narrative: data.narrative,
        choices: data.choices || [],
        image_prompt: data.imagePrompt || null,
        is_ending: data.isEnding || false,
      },
      { transaction: t }
    );

    return seq;
  });
}

/**
 * 更新场景图片 URL（图片异步生成完成后调用）
 * @param {string} storyId
 * @param {number} seq
 * @param {string} imageUrl
 */
async function updateSceneImageUrl(storyId, seq, imageUrl) {
  await models.AdventureScene.update(
    { image_url: imageUrl },
    { where: { story_id: storyId, seq } }
  );
}

/**
 * 获取场景列表
 * @param {string} storyId
 * @param {{ fromSeq?: number, limit?: number, chapter?: number, desc?: boolean }} options
 * @returns {Promise<object[]>}
 */
async function getScenes(storyId, { fromSeq, limit, chapter, desc = false } = {}) {
  const { Op } = require("sequelize");
  const where = { story_id: storyId };
  if (fromSeq != null) where.seq = { [Op.gte]: fromSeq };
  if (chapter != null) where.chapter = chapter;

  const rows = await models.AdventureScene.findAll({
    where,
    order: [["seq", desc ? "DESC" : "ASC"]],
    limit: limit || undefined,
  });
  return rows.map((r) => r.toJSON());
}

// ===== Memory Files =====

/**
 * 获取记忆文件
 * @param {string} storyId
 * @param {{ types?: string[], paths?: string[], onlyPinned?: boolean, includeDeleted?: boolean }} options
 * @returns {Promise<object[]>}
 */
async function getMemoryFiles(
  storyId,
  { types, paths, onlyPinned, includeDeleted = false } = {}
) {
  const { Op } = require("sequelize");
  const where = { story_id: storyId };
  if (!includeDeleted) where.deleted_at = null;
  if (types && types.length > 0) where.node_type = { [Op.in]: types };
  if (paths && paths.length > 0) where.path = { [Op.in]: paths };
  if (onlyPinned) where.pinned = true;

  const rows = await models.AdventureMemoryFile.findAll({ where });
  return rows.map((r) => r.toJSON());
}

/**
 * 批量应用记忆更新（事务 + 乐观锁）
 * @param {string} storyId
 * @param {Array<{ op: string, path: string, node_type?: string, content?: string }>} updates
 * @param {number} sceneSeq - 当前场景序号
 */
async function applyMemoryUpdates(storyId, updates, sceneSeq) {
  if (!updates || updates.length === 0) return;

  const { getSequelize } = require("../core/db");
  const sequelize = getSequelize();
  const { Op } = require("sequelize");

  // 限制每轮最多 5 条（防止 LLM 越界）
  const safeUpdates = updates.slice(0, 5);

  await sequelize.transaction(async (t) => {
    for (const upd of safeUpdates) {
      const { op, path, content } = upd;
      if (!op || !path) continue;

      const nodeType = upd.node_type || "scratch";

      if (op === "upsert") {
        const safeContent = clampContent(content || "");
        const existing = await models.AdventureMemoryFile.findOne({
          where: { story_id: storyId, path },
          transaction: t,
        });

        if (existing) {
          // 不允许修改 pinned 文件
          if (existing.pinned) {
            console.warn("[Memory] 跳过 pinned 文件修改:", path);
            continue;
          }
          await existing.update(
            {
              content: safeContent,
              node_type: nodeType,
              version: existing.version + 1,
              last_scene_seq: sceneSeq,
              deleted_at: null, // 恢复已归档的文件
            },
            { transaction: t }
          );
        } else {
          await models.AdventureMemoryFile.create(
            {
              story_id: storyId,
              path,
              node_type: nodeType,
              content: safeContent,
              version: 1,
              pinned: false,
              last_scene_seq: sceneSeq,
            },
            { transaction: t }
          );
        }
      } else if (op === "append") {
        const appendContent = clampContent(content || "");
        const existing = await models.AdventureMemoryFile.findOne({
          where: { story_id: storyId, path },
          transaction: t,
        });

        if (existing) {
          if (existing.pinned) {
            console.warn("[Memory] 跳过 pinned 文件 append:", path);
            continue;
          }
          const merged = clampContent(
            existing.content + "\n" + appendContent
          );
          await existing.update(
            {
              content: merged,
              version: existing.version + 1,
              last_scene_seq: sceneSeq,
              deleted_at: null,
            },
            { transaction: t }
          );
        } else {
          await models.AdventureMemoryFile.create(
            {
              story_id: storyId,
              path,
              node_type: nodeType,
              content: clampContent(appendContent),
              version: 1,
              pinned: false,
              last_scene_seq: sceneSeq,
            },
            { transaction: t }
          );
        }
      } else if (op === "archive") {
        const existing = await models.AdventureMemoryFile.findOne({
          where: { story_id: storyId, path },
          transaction: t,
        });
        if (existing && !existing.pinned) {
          await existing.update(
            { deleted_at: new Date() },
            { transaction: t }
          );
        }
      }
    }
  });
}

/**
 * 创建或覆盖记忆文件（系统内部使用，不受乐观锁限制）
 * @param {string} storyId
 * @param {{ path: string, nodeType: string, content: string, pinned?: boolean }} data
 */
async function upsertMemoryFile(storyId, { path, nodeType, content, pinned = false }) {
  const safeContent = clampContent(content);
  const existing = await models.AdventureMemoryFile.findOne({
    where: { story_id: storyId, path },
  });

  if (existing) {
    await existing.update({
      content: safeContent,
      node_type: nodeType,
      version: existing.version + 1,
      deleted_at: null,
    });
  } else {
    await models.AdventureMemoryFile.create({
      story_id: storyId,
      path,
      node_type: nodeType,
      content: safeContent,
      version: 1,
      pinned,
      last_scene_seq: 0,
    });
  }
}

/**
 * 标记章节压缩进行中
 * @param {string} storyId
 * @param {number} minutes - 压缩预计耗时
 */
async function markCompactionPending(storyId, minutes = 5) {
  const until = new Date(Date.now() + minutes * 60 * 1000);
  await models.AdventureStory.update(
    { compaction_pending_until: until },
    { where: { story_id: storyId } }
  );
}

/**
 * 清除章节压缩标记
 * @param {string} storyId
 */
async function clearCompactionPending(storyId) {
  await models.AdventureStory.update(
    { compaction_pending_until: null },
    { where: { story_id: storyId } }
  );
}

module.exports = {
  generateUUID,
  createStory,
  loadStory,
  listStories,
  updateStoryProgress,
  acquireLock,
  releaseLock,
  appendScene,
  updateSceneImageUrl,
  getScenes,
  getMemoryFiles,
  applyMemoryUpdates,
  upsertMemoryFile,
  markCompactionPending,
  clearCompactionPending,
};
