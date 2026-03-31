/**
 * 财务助手 Brain — ReAct 推理循环
 *
 * 基于通用 brain.js 架构，使用财务专属系统提示词和技能集。
 */

const { chat } = require("./llm");
const skills = require("./finance-skills");

const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `你是「光明财务助理」，一个专业、简洁、值得信赖的个人财务 AI 助手。
你的职责是帮助用户记录和分析个人财务数据，包括：收支记录、预算管理、财务分析与建议。

回复要求：
- 简洁明了，数据说话
- 语气专业但友好
- 涉及金额时使用 ¥ 符号
- 如果用户提供了个人资料，适当结合用户信息给出个性化建议
- 使用中文回复

你可以使用以下工具：

1. record 工具 — 记录财务数据，records 数组中每条记录通过 type 区分：
   - type="expense": 当用户提到花钱、消费、买东西、付款等支出时
   - type="income": 当用户提到收入、工资、报销、红包、投资收益等进账时
   - type="budget": 当用户提到预算、限额、每月/每周/每天花费上限时
   如果用户的消息同时涉及多种记录（如"发了工资8000，午饭花了35"），应在一次 record 调用的 records 数组中包含多条记录。

2. query 工具 — 查询和分析财务数据：
   - 当用户想了解自己的收支情况、花费明细、收入统计时使用
   - 支持按日期和类型筛选
   - 返回记录明细和汇总统计（总支出、总收入、净收支、分类统计）
   - 拿到查询结果后，请用简洁易懂的方式为用户分析总结

不涉及工具的普通对话（如财务建议、理财知识），直接回复即可，不要强行调用工具。`;

function buildSystemPrompt(profile) {
  const parts = [SYSTEM_PROMPT];
  if (profile) {
    const info = [];
    if (profile.name) info.push("称呼：" + profile.name);
    if (profile.age) info.push("年龄：" + profile.age);
    if (profile.gender) info.push("性别：" + profile.gender);
    if (profile.hobbies) info.push("爱好：" + profile.hobbies);
    if (profile.bio) info.push("个人简介：" + profile.bio);
    if (info.length > 0) {
      parts.push("\n用户资料：\n" + info.join("\n"));
    }
  }
  return parts.join("");
}

/**
 * ReAct 推理循环
 */
async function* think({ messages, model, apiKey, profile }) {
  const systemPrompt = buildSystemPrompt(profile);
  const conversationMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const result = await chat(model, conversationMessages, apiKey, {
      tools: skills.definitions,
    });

    if (!result.tool_calls || result.tool_calls.length === 0) {
      yield { type: "answer", content: result.content };
      return;
    }

    yield {
      type: "thinking",
      iteration: i + 1,
      maxIterations: MAX_ITERATIONS,
      content: result.content,
      tool_calls: result.tool_calls.map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };

    conversationMessages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.tool_calls,
    });

    for (const call of result.tool_calls) {
      let args;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (e) {
        args = {};
      }

      const startTime = Date.now();
      const toolResult = await skills.execute(call.function.name, args);
      const duration = Date.now() - startTime;

      yield {
        type: "tool_result",
        name: call.function.name,
        arguments: call.function.arguments,
        result: toolResult,
        duration,
      };

      conversationMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  yield {
    type: "answer",
    content: "抱歉，处理过程有些复杂，请重新描述你的需求。",
  };
}

module.exports = { think };
