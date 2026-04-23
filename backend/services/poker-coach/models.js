/**
 * 扑克教练 — 数据库模型定义
 *
 * poker_users:    用户表（anon_token 标识匿名用户）
 * poker_hands:    手牌记录（结构化表单数据）
 * poker_analyses: 决策点分析（每手牌 1-2 个关键决策点）
 * poker_leaks:    Leak 模式记录（累积 ≥10 手后识别）
 */

const { DataTypes } = require("sequelize");

let PokerUser, PokerHand, PokerAnalysis, PokerLeak;

function define(sequelize) {
  PokerUser = sequelize.define(
    "PokerUser",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      anon_token: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
        comment: "前端生成的 UUID 匿名令牌",
      },
    },
    { tableName: "poker_users", underscored: true }
  );

  PokerHand = sequelize.define(
    "PokerHand",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: "所属用户 ID",
      },
      blind_level: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "盲注级别，如 1/2、5/10",
      },
      table_type: {
        type: DataTypes.ENUM("6max", "9max", "hu"),
        allowNull: false,
        defaultValue: "6max",
        comment: "桌型",
      },
      hero_position: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "Hero 位置，如 BTN、BB、CO",
      },
      hero_cards: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "Hero 起手牌，如 AsKd 或 AK suited",
      },
      effective_stack_bb: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: "有效筹码（BB 数）",
      },
      opponent_notes: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: "对手信息备注（可选）",
      },
      preflop_actions: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "翻前行动描述",
      },
      flop_cards: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "翻牌公共牌，如 Ah 7h 2c",
      },
      flop_actions: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "翻牌行动描述",
      },
      turn_card: {
        type: DataTypes.STRING(5),
        allowNull: true,
        comment: "转牌，如 Kd",
      },
      turn_actions: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "转牌行动描述",
      },
      river_card: {
        type: DataTypes.STRING(5),
        allowNull: true,
        comment: "河牌，如 5h",
      },
      river_actions: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "河牌行动描述",
      },
      result_bb: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: "结果（BB 数，正为赢，负为输）",
      },
      showdown_opp_cards: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: "摊牌时对手底牌（可选）",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "用户备注",
      },
      played_at: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "牌局日期",
      },
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
      is_analyzed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "是否已完成 AI 分析",
      },
    },
    { tableName: "poker_hands", underscored: true }
  );

  PokerAnalysis = sequelize.define(
    "PokerAnalysis",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      hand_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: "所属手牌 ID",
      },
      street: {
        type: DataTypes.ENUM("preflop", "flop", "turn", "river"),
        allowNull: false,
        comment: "决策点所在街",
      },
      scenario: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "场景复述（位置、底池、行动）",
      },
      rating: {
        type: DataTypes.ENUM("good", "acceptable", "problematic"),
        allowNull: false,
        comment: "决策评级",
      },
      hero_action: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Hero 的实际操作",
      },
      better_action: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "更优选择（rating 为 good 时可为空）",
      },
      reasoning: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "分析推理（教练口吻）",
      },
      principle: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "背后的通用原则",
      },
    },
    { tableName: "poker_analyses", underscored: true, updatedAt: false }
  );

  PokerLeak = sequelize.define(
    "PokerLeak",
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        comment: "所属用户 ID",
      },
      pattern: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Leak 模式描述",
      },
      occurrences: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
        comment: "出现次数",
      },
      example_hand_ids: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: "示例手牌 ID 数组",
      },
    },
    { tableName: "poker_leaks", underscored: true }
  );
}

async function afterSync(qi) {
  try {
    await qi.addIndex("poker_hands", ["user_id", "created_at"], {
      name: "idx_poker_hands_user_time",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_analyses", ["hand_id"], {
      name: "idx_poker_analyses_hand",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_leaks", ["user_id", "updated_at"], {
      name: "idx_poker_leaks_user",
    });
  } catch (_) {}
}

module.exports = {
  define,
  afterSync,
  get PokerUser() { return PokerUser; },
  get PokerHand() { return PokerHand; },
  get PokerAnalysis() { return PokerAnalysis; },
  get PokerLeak() { return PokerLeak; },
};
