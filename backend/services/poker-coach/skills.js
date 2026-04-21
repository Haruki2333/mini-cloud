/**
 * 扑克教练 — 工具定义与执行函数
 *
 * get_hand_detail:   获取手牌完整信息（含已有分析）
 * save_analysis:     保存决策点分析结果
 * get_user_analyses: 获取用户历史分析（供 Leak 识别）
 * save_leaks:        保存识别出的 Leak 模式
 */

const dao = require("./dao");

// ===== get_hand_detail =====

const getHandDetailDefinition = {
  type: "function",
  function: {
    name: "get_hand_detail",
    description: "获取指定手牌的完整结构化信息，包括每条街的行动和已有的分析结果。分析手牌前必须先调用此工具。",
    parameters: {
      type: "object",
      properties: {
        hand_id: {
          type: "number",
          description: "手牌 ID",
        },
      },
      required: ["hand_id"],
    },
  },
};

async function executeGetHandDetail(args, userId) {
  const hand = await dao.getHandWithAnalyses(args.hand_id, userId);
  if (!hand) {
    return { success: false, message: "手牌不存在或无权访问" };
  }
  return { success: true, hand };
}

// ===== save_analysis =====

const saveAnalysisDefinition = {
  type: "function",
  function: {
    name: "save_analysis",
    description: "保存对一手牌的决策点分析结果。分析完成后调用此工具将结果存入数据库。",
    parameters: {
      type: "object",
      properties: {
        hand_id: {
          type: "number",
          description: "手牌 ID",
        },
        analyses: {
          type: "array",
          description: "决策点分析数组（1-2 个）",
          items: {
            type: "object",
            properties: {
              street: {
                type: "string",
                enum: ["preflop", "flop", "turn", "river"],
                description: "决策点所在街",
              },
              scenario: {
                type: "string",
                description: "场景复述（50-100字）：位置、底池大小、对手行动、Hero的选择",
              },
              rating: {
                type: "string",
                enum: ["good", "acceptable", "problematic"],
                description: "决策评级：good=好，acceptable=可接受，problematic=有问题",
              },
              hero_action: {
                type: "string",
                description: "Hero 的实际操作（10字以内）",
              },
              better_action: {
                type: "string",
                description: "更优选择的描述（rating 为 good 时可不填）",
              },
              reasoning: {
                type: "string",
                description: "推理解释（100-200字），用教练口吻讲清楚为什么",
              },
              principle: {
                type: "string",
                description: "背后的通用德扑原则（30-60字）",
              },
            },
            required: ["street", "scenario", "rating", "hero_action", "reasoning", "principle"],
          },
        },
      },
      required: ["hand_id", "analyses"],
    },
  },
};

async function executeSaveAnalysis(args, userId) {
  const hand = await dao.getHand(args.hand_id, userId);
  if (!hand) {
    return { success: false, message: "手牌不存在或无权访问" };
  }

  const saved = await dao.saveAnalyses(args.hand_id, args.analyses);
  return { success: true, saved_count: saved.length };
}

// ===== get_user_analyses =====

const getUserAnalysesDefinition = {
  type: "function",
  function: {
    name: "get_user_analyses",
    description: "获取用户的历史决策分析记录，用于识别重复出现的 Leak 模式。",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "最多返回的分析条数，默认 100",
        },
      },
    },
  },
};

async function executeGetUserAnalyses(args, userId) {
  const limit = args.limit || 100;
  const analyses = await dao.getUserAnalyses(userId, limit);
  return { success: true, count: analyses.length, analyses };
}

// ===== save_leaks =====

const saveLeaksDefinition = {
  type: "function",
  function: {
    name: "save_leaks",
    description: "保存识别出的 Leak 模式（会替换该用户之前的所有 Leak 记录）。",
    parameters: {
      type: "object",
      properties: {
        leaks: {
          type: "array",
          description: "Leak 模式数组",
          items: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Leak 描述，说清楚什么场景下什么问题，以及出现频率",
              },
              occurrences: {
                type: "number",
                description: "出现次数",
              },
              example_hand_ids: {
                type: "array",
                description: "相关手牌 ID 数组",
                items: { type: "number" },
              },
            },
            required: ["pattern", "occurrences"],
          },
        },
      },
      required: ["leaks"],
    },
  },
};

async function executeSaveLeaks(args, userId) {
  const saved = await dao.saveLeaks(userId, args.leaks);
  return { success: true, saved_count: saved.length };
}

module.exports = {
  getHandDetailDefinition,
  saveAnalysisDefinition,
  getUserAnalysesDefinition,
  saveLeaksDefinition,
  executeGetHandDetail,
  executeSaveAnalysis,
  executeGetUserAnalyses,
  executeSaveLeaks,
};
