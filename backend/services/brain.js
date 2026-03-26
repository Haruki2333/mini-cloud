/**
 * 轻量 Brain — ReAct 推理循环
 *
 * 参考 OpenClaw 设计理念，自实现的 Agent 推理核心。
 * 通过 async generator 逐步 yield 事件，供上层以 SSE 形式推送给前端。
 */

const { chat } = require("./llm");
const skills = require("./skills");

const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `你是「光明生活助理」，一个温暖友善、简洁实用的 AI 助手。
你的职责是帮助用户处理日常生活中的各种问题，包括但不限于：生活建议、知识问答、日程规划、情感支持等。
回复要求：
- 简洁明了，避免冗长
- 语气温暖亲切，像一个靠谱的朋友
- 如果用户提供了个人资料，适当结合用户信息给出个性化建议
- 使用中文回复

你可以使用工具来帮助用户完成实际任务：
- record_expense: 当用户提到花钱、消费、买东西、付款等支出相关内容时，帮他记录这笔支出
- record_food: 当用户提到吃了什么食物、饮食相关内容时，帮他记录食物
如果用户的消息同时涉及支出和食物（如"中午吃拉面花了35"），应同时调用两个工具。
不涉及工具的普通对话，直接回复即可，不要强行调用工具。`;

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
 *
 * @param {object} params
 * @param {Array} params.messages - 用户消息列表
 * @param {string} params.model - 模型 ID
 * @param {string} params.apiKey - API Key
 * @param {object} [params.profile] - 用户资料
 * @yields {{ type: string, ... }} SSE 事件
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

    // 没有 tool_calls → 推理完成，返回最终回复
    if (!result.tool_calls || result.tool_calls.length === 0) {
      yield { type: "answer", content: result.content };
      return;
    }

    // 有 tool_calls → 通知前端正在思考
    yield {
      type: "thinking",
      content: result.content,
      tool_calls: result.tool_calls.map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
    };

    // 将 assistant 的回复（含 tool_calls）加入对话上下文
    conversationMessages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.tool_calls,
    });

    // 执行每个工具调用
    for (const call of result.tool_calls) {
      let args;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (e) {
        args = {};
      }

      const toolResult = await skills.execute(call.function.name, args);

      yield {
        type: "tool_result",
        name: call.function.name,
        result: toolResult,
      };

      // 将工具结果加入对话上下文
      conversationMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
    // 继续循环 → LLM 观察工具结果后决定下一步
  }

  // 超过最大轮次，兜底回复
  yield {
    type: "answer",
    content: "抱歉，处理过程有些复杂，请重新描述你的需求。",
  };
}

module.exports = { think };
