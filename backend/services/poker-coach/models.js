/**
 * 扑克教练 — 数据库模型定义
 *
 * poker_users:    用户表（anon_token 标识匿名用户）
 * poker_hands:    手牌记录（结构化表单数据）
 * poker_analyses: 决策点分析（每手牌 1-2 个关键决策点）
 * poker_leaks:    Leak 模式记录（累积 ≥10 手后识别）
 */

const { DataTypes } = require("sequelize");

let PokerUser, PokerHand, PokerAnalysis, PokerLeak, PokerEvalRun, PokerEvalResult;

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
      analysis_model_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: "本次分析所用模型 ID（save_analysis 落库时写入）",
      },
      analysis_prompt_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: "本次分析累计输入 token 数",
      },
      analysis_completion_tokens: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: "本次分析累计输出 token 数",
      },
      analysis_cost_usd: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: "本次分析累计成本（与 pricing.js 单位一致）",
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
    { tableName: "poker_analyses", underscored: true }
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

  PokerEvalRun = sequelize.define(
    "PokerEvalRun",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      hand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      requested_models: { type: DataTypes.JSON, allowNull: false, comment: "请求的模型 ID 数组" },
      status: {
        type: DataTypes.ENUM("running", "completed", "partial", "failed"),
        allowNull: false,
        defaultValue: "running",
      },
      total_cost_usd: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
      consistency_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true, comment: "模型间 rating 一致率 0-100" },
      judge_model_id: { type: DataTypes.STRING(64), allowNull: true },
    },
    { tableName: "poker_eval_runs", underscored: true }
  );

  PokerEvalResult = sequelize.define(
    "PokerEvalResult",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      eval_run_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      hand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: "冗余，便于直查" },
      model_id: { type: DataTypes.STRING(64), allowNull: false },
      provider: { type: DataTypes.STRING(32), allowNull: false },
      status: { type: DataTypes.ENUM("success", "failed", "timeout"), allowNull: false },
      latency_ms: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      prompt_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      completion_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      cached_tokens: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      cost_usd: { type: DataTypes.DECIMAL(10, 6), allowNull: true, defaultValue: 0 },
      structured_output: { type: DataTypes.JSON, allowNull: true, comment: "schema 合规时保存 analyses 数组" },
      raw_response: { type: DataTypes.TEXT, allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      schema_valid: { type: DataTypes.BOOLEAN, allowNull: true },
      judge_score: { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
      judge_notes: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "poker_eval_results", underscored: true }
  );
}

async function afterSync(qi) {
  // sync({alter:true}) 在向已有数据的表追加 NOT NULL DATETIME 列时会失败（无默认值），
  // 这里手动补齐 updated_at，已存在则忽略 Duplicate column name 错误。
  const ensureUpdatedAt = async (table) => {
    try {
      await qi.sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`updated_at\` DATETIME NOT NULL ` +
          `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
      console.log(`[PokerModels] 已为 ${table} 补齐 updated_at 列`);
    } catch (e) {
      if (!/Duplicate column name/i.test(e.message || "")) {
        console.warn(`[PokerModels] 补齐 ${table}.updated_at 失败:`, e.message);
      }
    }
  };
  await ensureUpdatedAt("poker_analyses");

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
  try {
    await qi.addIndex("poker_eval_runs", ["hand_id", "created_at"], {
      name: "idx_eval_runs_hand_time",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_eval_runs", ["user_id", "created_at"], {
      name: "idx_eval_runs_user_time",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_eval_results", ["eval_run_id"], {
      name: "idx_eval_results_run",
    });
  } catch (_) {}
  try {
    await qi.addIndex("poker_eval_results", ["hand_id", "model_id"], {
      name: "idx_eval_results_hand_model",
    });
  } catch (_) {}
}

module.exports = {
  define,
  afterSync,
  get PokerUser()       { return PokerUser; },
  get PokerHand()       { return PokerHand; },
  get PokerAnalysis()   { return PokerAnalysis; },
  get PokerLeak()       { return PokerLeak; },
  get PokerEvalRun()    { return PokerEvalRun; },
  get PokerEvalResult() { return PokerEvalResult; },
};
