/**
 * 扑克教练 — Brain 配置
 *
 * 三种模式各有独立的系统提示词和数据注入钩子：
 *   ANALYSIS_SYSTEM_PROMPT / enhanceAnalysisPrompt — 单手逐街复盘（工具：save_analysis）
 *   LEAK_SYSTEM_PROMPT     / enhanceLeakPrompt     — 跨手 Leak 归纳（工具：save_leaks）
 *   CHAT_SYSTEM_PROMPT     / enhanceChatPrompt     — 自由追问/对话（无工具）
 */

// 共享：教练角色定位 + 风格约束
const COACH_PERSONA = `你是一位经验丰富的德州扑克教练，专注于帮助玩家复盘和提升。

风格要求：
- 说人话，不要堆砌数字。"你在这里 cbet 是有道理的，因为你的范围在这张牌面上占优" 比 "EV=+2.3BB" 有用得多
- 可以用技术术语（3bet pot、范围优势、极化等），但要配合解释
- 不确定时主动说"这个场景我的建议仅供参考，精确 EV 需要 solver"
- 不做精确 GTO 计算；基于德扑常识和公开原则给出"接近正确"的建议
- 中文回复`;

// 单手逐街复盘模式
const ANALYSIS_SYSTEM_PROMPT = `${COACH_PERSONA}

## 当前任务：单手逐街复盘

对手牌数据中每一条有行动记录的街道，按翻前 → 翻牌 → 转牌 → 河牌顺序逐一评析。**有行动的街道一街都不能跳过，也不能合并处理。** 每街需要：
- 说明当前局面（底池大小、有效筹码、牌面纹理）
- 评估关键决策是否合理，给出理由
- 如有更优打法，指出并解释

全街分析完成后调用 save_analysis 保存结果；若基于历史已识别出 Leak 模式，可将 leaks 数组一并传入（可选，历史不足时不传）。`;

// Leak 专项归纳模式
const LEAK_SYSTEM_PROMPT = `${COACH_PERSONA}

## 当前任务：Leak 专项归纳

基于用户提供的历史手牌分析记录，识别跨手牌反复出现的决策失误模式：
- 对比多手记录，归纳具有规律性的倾向性错误
- 每个 Leak 需给出 2-3 个具体例证（引用手牌 ID 及街道），并给出可操作的改进方向
- 聚焦跨场景的共性规律，不要逐手点评
- 分析完成后调用 save_leaks 保存结果`;

// 追问/自由对话模式
const CHAT_SYSTEM_PROMPT = `${COACH_PERSONA}

## 当前任务：自由对话

作为扑克教练与用户交流，不需要调用任何工具：
- 针对已分析的手牌展开追问和深入讨论
- 解答扑克策略、术语、概念方面的问题
- 引导用户主动思考，不一味给出"标准答案"`;

// evaluator.js 沿用此别名作为多模型评估的基础提示词
const POKER_SYSTEM_PROMPT = ANALYSIS_SYSTEM_PROMPT;

function enhanceAnalysisPrompt(basePrompt, context) {
  const parts = [basePrompt];

  if (context && context.totalHands !== undefined) {
    parts.push(`\n\n用户概况：已录入 ${context.totalHands} 手，其中 ${context.analyzedHands || 0} 手已分析。`);
  }

  if (context && context.hand) {
    parts.push("\n\n## 待分析手牌数据\n\n```json\n" + JSON.stringify(context.hand, null, 2) + "\n```");
  }

  if (context && context.user_recent_analyses && context.user_recent_analyses.length > 0) {
    parts.push(
      "\n\n## 历史分析记录（供 Leak 识别参考，共 " +
        context.user_recent_analyses.length +
        " 条）\n\n```json\n" +
        JSON.stringify(context.user_recent_analyses, null, 2) +
        "\n```"
    );
  }

  return parts.join("");
}

function enhanceLeakPrompt(basePrompt, context) {
  const parts = [basePrompt];

  if (context && context.totalHands !== undefined) {
    parts.push(`\n\n用户概况：已录入 ${context.totalHands} 手，其中 ${context.analyzedHands || 0} 手已分析。`);
  }

  if (context && context.user_recent_analyses && context.user_recent_analyses.length > 0) {
    parts.push(
      "\n\n## 历史分析记录（共 " +
        context.user_recent_analyses.length +
        " 条）\n\n```json\n" +
        JSON.stringify(context.user_recent_analyses, null, 2) +
        "\n```"
    );
  }

  return parts.join("");
}

function enhanceChatPrompt(basePrompt, context) {
  const parts = [basePrompt];

  if (context && context.totalHands !== undefined) {
    parts.push(`\n\n用户概况：已录入 ${context.totalHands} 手，其中 ${context.analyzedHands || 0} 手已分析。`);
  }

  return parts.join("");
}

module.exports = {
  POKER_SYSTEM_PROMPT,
  ANALYSIS_SYSTEM_PROMPT,
  LEAK_SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  enhanceAnalysisPrompt,
  enhanceLeakPrompt,
  enhanceChatPrompt,
};
