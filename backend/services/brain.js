/**
 * 通用 Brain — ReAct 推理循环工厂
 *
 * 参考 OpenClaw 设计理念，自实现的 Agent 推理核心。
 * 通过 createBrain 注入系统提示词和技能集，返回 { think } 对象。
 * think 是 async generator，逐步 yield 事件，供上层以 SSE 形式推送给前端。
 */

const { chat } = require("./llm");

const MAX_ITERATIONS = 5;

function buildSystemPrompt(basePrompt, profile) {
  const parts = [basePrompt];
  if (profile) {
    const info = [];
    if (profile.name) info.push("称呼：" + profile.name);
    if (profile.budgets && profile.budgets.length > 0) {
      const lines = profile.budgets
        .map((b) => b.category + "：¥" + b.amount + "/" + b.period)
        .join("、");
      info.push("预算设置：" + lines);
    }
    if (profile.expenseCategories && profile.expenseCategories.length > 0) {
      info.push("支出分类：" + profile.expenseCategories.join("、"));
    }
    if (info.length > 0) {
      parts.push("\n用户资料：\n" + info.join("\n"));
    }
  }
  return parts.join("");
}

function buildToolDefs(skills, profile) {
  if (!profile || !profile.expenseCategories || profile.expenseCategories.length === 0) {
    return skills.definitions;
  }
  const categories = profile.expenseCategories;
  return skills.definitions.map((def) => {
    if (def.function && def.function.name === "record") {
      const cloned = JSON.parse(JSON.stringify(def));
      const itemProps = cloned.function.parameters.properties.records.items.properties;
      if (itemProps.category) {
        itemProps.category.enum = categories;
        itemProps.category.description =
          "分类（expense/budget 必填），可选值：" + categories.join("、");
      }
      return cloned;
    }
    return def;
  });
}

/**
 * 创建一个 Brain 实例
 *
 * @param {object} config
 * @param {string} config.systemPrompt - 系统提示词
 * @param {{ definitions: Array, execute: Function }} config.skills - 技能注册表
 * @returns {{ think: AsyncGeneratorFunction }}
 */
function createBrain({ systemPrompt, skills }) {
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
  async function* think({ messages, model, apiKey, profile, userId }) {
    const prompt = buildSystemPrompt(systemPrompt, profile);
    const conversationMessages = [
      { role: "system", content: prompt },
      ...messages,
    ];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = await chat(model, conversationMessages, apiKey, {
        tools: buildToolDefs(skills, profile),
      });

      // 没有 tool_calls → 推理完成，返回最终回复
      if (!result.tool_calls || result.tool_calls.length === 0) {
        yield { type: "answer", content: result.content };
        return;
      }

      // 有 tool_calls → 通知前端正在思考
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

        const startTime = Date.now();
        const toolResult = await skills.execute(call.function.name, args, userId);
        const duration = Date.now() - startTime;

        yield {
          type: "tool_result",
          name: call.function.name,
          arguments: call.function.arguments,
          result: toolResult,
          duration,
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

  return { think };
}

module.exports = { createBrain };
