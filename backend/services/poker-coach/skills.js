/**
 * 扑克教练 — 工具定义与执行函数
 *
 * save_analysis: 保存决策点分析结果（含可选的 Leak 模式更新）
 * save_leaks:    保存识别出的 Leak 模式（Leak 专项分析模式使用）
 */

const dao = require("./dao");

// ===== save_analysis =====

const saveAnalysisDefinition = {
  type: "function",
  function: {
    name: "save_analysis",
    description: "保存对一手牌的决策点分析结果。分析完成后调用此工具将结果存入数据库。若已识别出 Leak 模式，将 leaks 数组一并传入，无需单独调用其他工具。",
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
        leaks: {
          type: "array",
          description: "（可选）识别出的 Leak 模式数组。历史手牌不足或无明显规律时可不传。传入后会替换该用户之前的全部 Leak 记录。",
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
      required: ["hand_id", "analyses"],
    },
  },
};

async function executeSaveAnalysis(args, userId) {
  const belongs = await dao.handBelongsToUser(args.hand_id, userId);
  if (!belongs) {
    return { success: false, message: "手牌不存在或无权访问" };
  }

  const saved = await dao.saveAnalyses(args.hand_id, args.analyses);

  let leaks_saved_count = 0;
  if (args.leaks && args.leaks.length > 0) {
    const savedLeaks = await dao.saveLeaks(userId, args.leaks);
    leaks_saved_count = savedLeaks.length;
  }

  return { success: true, saved_count: saved.length, leaks_saved_count };
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
  saveAnalysisDefinition,
  executeSaveAnalysis,
  saveLeaksDefinition,
  executeSaveLeaks,
};
