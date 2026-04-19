/**
 * 冒险游戏 — 数据库模型定义
 *
 * 三张表支撑长篇记忆系统：
 * - adventure_stories：故事元数据（章节进度、世界观、目标、并发锁）
 * - adventure_memory_files：虚拟文件树（角色/物品/地点/章节摘要/临时笔记）
 * - adventure_scenes：场景记录（每轮叙述、玩家行动、图片）
 *
 * 通过 define/afterSync 接口供 core/db.js 的 initDB 调用。
 */

const { DataTypes } = require("sequelize");

let AdventureStory, AdventureMemoryFile, AdventureScene, AdventureTokenUsage;

/**
 * 定义模型
 * @param {import("sequelize").Sequelize} sequelize
 */
function define(sequelize) {
  AdventureStory = sequelize.define(
    "AdventureStory",
    {
      story_id: {
        type: DataTypes.STRING(36),
        primaryKey: true,
        comment: "UUID",
      },
      user_token: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: "用户标识（openid 或匿名 UUID）",
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "故事标题（世界观确定后首场景设置）",
      },
      status: {
        type: DataTypes.ENUM("active", "ended"),
        defaultValue: "active",
        comment: "故事状态",
      },
      current_chapter: {
        type: DataTypes.TINYINT.UNSIGNED,
        defaultValue: 1,
        comment: "当前章节（1-5）",
      },
      current_beat: {
        type: DataTypes.TINYINT.UNSIGNED,
        defaultValue: 1,
        comment: "当前章内节拍（1-10）",
      },
      scene_count: {
        type: DataTypes.SMALLINT.UNSIGNED,
        defaultValue: 0,
        comment: "累计场景数（用于生成下一场景 seq）",
      },
      world_setting: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "世界观文本",
      },
      goal: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "本局目标",
      },
      character_profile: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "玩家档案（name/genre/roleType/tone）",
      },
      compaction_pending_until: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "章末压缩任务预计完成时间（用于降级判断）",
      },
      lock_token: {
        type: DataTypes.STRING(36),
        allowNull: true,
        comment: "并发锁令牌",
      },
      lock_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "并发锁过期时间（防崩溃死锁）",
      },
      last_played_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "最近游玩时间",
      },
      player_age: {
        type: DataTypes.TINYINT.UNSIGNED,
        allowNull: true,
        comment: "玩家输入的真实年龄（影响主角年龄设定）",
      },
      legacy: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "本世遗产（结局时由 AI 生成，供下一世觉醒注入）",
      },
    },
    { tableName: "adventure_stories", underscored: true }
  );

  AdventureMemoryFile = sequelize.define(
    "AdventureMemoryFile",
    {
      story_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true,
        comment: "所属故事 ID",
      },
      path: {
        type: DataTypes.STRING(200),
        allowNull: false,
        primaryKey: true,
        comment: "虚拟路径（如 /characters/alice.md）",
      },
      node_type: {
        type: DataTypes.ENUM(
          "world",
          "goal",
          "character",
          "item",
          "location",
          "chapter",
          "scratch"
        ),
        allowNull: false,
        comment: "节点类型",
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "文件内容（4KB 硬上限）",
      },
      version: {
        type: DataTypes.INTEGER.UNSIGNED,
        defaultValue: 1,
        comment: "版本号（乐观锁）",
      },
      pinned: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "始终注入到 system prompt",
      },
      last_scene_seq: {
        type: DataTypes.SMALLINT.UNSIGNED,
        defaultValue: 0,
        comment: "最后一次更新时的场景序号（用于相关性筛选）",
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "软删除时间（archive 操作）",
      },
    },
    {
      tableName: "adventure_memory_files",
      underscored: true,
      // 不使用 deletedAt 的 paranoid 模式，使用自定义 deleted_at
      paranoid: false,
    }
  );

  AdventureScene = sequelize.define(
    "AdventureScene",
    {
      story_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        primaryKey: true,
        comment: "所属故事 ID",
      },
      seq: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: false,
        primaryKey: true,
        comment: "场景序号（从 1 开始）",
      },
      chapter: {
        type: DataTypes.TINYINT.UNSIGNED,
        defaultValue: 1,
        comment: "所在章节（1-5）",
      },
      beat: {
        type: DataTypes.TINYINT.UNSIGNED,
        defaultValue: 1,
        comment: "章内节拍（1-10）",
      },
      player_action: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "触发本场景的玩家输入（用于对话历史重建）",
      },
      narrative: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "AI 叙述文本",
      },
      choices: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "灵感提示或世界观选项",
      },
      image_url: {
        type: DataTypes.STRING(1000),
        allowNull: true,
        comment: "场景背景图 URL",
      },
      image_prompt: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "文生图提示词（仅开局和结局）",
      },
      is_ending: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否为故事结局",
      },
    },
    { tableName: "adventure_scenes", underscored: true, updatedAt: false }
  );

  AdventureTokenUsage = sequelize.define(
    "AdventureTokenUsage",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        comment: "自增主键",
      },
      story_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        comment: "所属故事 ID",
      },
      scene_seq: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: true,
        comment: "关联场景序号（对话轮次；章节压缩时为 null）",
      },
      usage_type: {
        type: DataTypes.ENUM("chat", "compact"),
        allowNull: false,
        comment: "chat=对话轮次，compact=章节压缩",
      },
      model: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "使用的模型 ID",
      },
      input_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: "输入 token 数（prompt_tokens）",
      },
      output_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: "输出 token 数（completion_tokens）",
      },
      cached_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: "缓存命中 token 数（提供商支持时记录，否则为 null）",
      },
    },
    { tableName: "adventure_token_usage", underscored: true, updatedAt: false }
  );
}

/**
 * sync 后创建索引
 * @param {import("sequelize").QueryInterface} qi
 */
async function afterSync(qi) {
  // 迁移：为已存在的表补充新列（addColumn 若列已存在会抛错，用 try/catch 忽略）
  try {
    await qi.addColumn("adventure_stories", "player_age", {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
      comment: "玩家输入的真实年龄（影响主角年龄设定）",
      after: "last_played_at",
    });
  } catch (_) {}
  try {
    await qi.addColumn("adventure_stories", "legacy", {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "本世遗产（结局时由 AI 生成，供下一世觉醒注入）",
      after: "player_age",
    });
  } catch (_) {}

  try {
    await qi.addIndex("adventure_stories", ["user_token", "last_played_at"], {
      name: "idx_adv_stories_user_time",
    });
  } catch (_) {}
  try {
    await qi.addIndex("adventure_memory_files", ["story_id", "node_type"], {
      name: "idx_adv_mem_story_type",
    });
  } catch (_) {}
  try {
    await qi.addIndex(
      "adventure_memory_files",
      ["story_id", "pinned", "deleted_at"],
      { name: "idx_adv_mem_pinned" }
    );
  } catch (_) {}
  try {
    await qi.addIndex("adventure_scenes", ["story_id", "chapter", "seq"], {
      name: "idx_adv_scene_chapter",
    });
  } catch (_) {}
  try {
    await qi.addIndex("adventure_token_usage", ["story_id", "created_at"], {
      name: "idx_adv_token_story_time",
    });
  } catch (_) {}
}

module.exports = {
  define,
  afterSync,
  get AdventureStory() {
    return AdventureStory;
  },
  get AdventureMemoryFile() {
    return AdventureMemoryFile;
  },
  get AdventureScene() {
    return AdventureScene;
  },
  get AdventureTokenUsage() {
    return AdventureTokenUsage;
  },
};
