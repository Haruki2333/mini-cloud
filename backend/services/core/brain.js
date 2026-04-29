/**
 * 通用 Brain — ReAct 推理循环工厂
 *
 * 通过 createBrain 注入系统提示词和技能集，返回 { think } 对象。
 * think 是 async generator，逐步 yield 事件，供上层以 SSE 形式推送给前端。
 *
 * 支持可选的 enhancePrompt / enhanceToolDefs 钩子，
 * 业务模块可通过钩子注入领域定制逻辑，而无需修改本模块。
 *
 * 流式模式：使用 chatStream 逐块处理 LLM 响应，并透传 args_delta 事件，
 * 供路由层从工具参数流中实时提取内容，减少用户等待时间。
 */

const { chatStream } = require("./llm");

const MAX_ITERATIONS = 5;

/**
 * 创建一个 Brain 实例
 *
 * @param {object} config
 * @param {string} config.systemPrompt - 基础系统提示词
 * @param {{ definitions: Array, execute: Function }} config.skills - 技能注册表
 * @param {Function} [config.enhancePrompt] - 可选钩子：enhancePrompt(basePrompt, context) → string
 * @param {Function} [config.enhanceToolDefs] - 可选钩子：enhanceToolDefs(definitions, context) → definitions
 * @param {string} [config.forceFirstTool] - 可选：在尚未调用过任何工具时，强制 LLM 调用此工具
 *   （传给 LLM 的 tool_choice）。当业务必须保证某次工具调用落库时使用，
 *   工具一旦执行过即回退到 auto，允许模型给出收尾回复。
 * @returns {{ think: AsyncGeneratorFunction }}
 */
function createBrain({ systemPrompt, skills, enhancePrompt, enhanceToolDefs, forceFirstTool }) {
  /**
   * ReAct 推理循环（流式版本）
   *
   * @param {object} params
   * @param {Array} params.messages - 用户消息列表
   * @param {string} params.model - 模型 ID
   * @param {string} params.apiKey - API Key
   * @param {number} [params.userId] - 用户 ID（传给技能执行函数）
   * @param {object} [params.context] - 业务上下文（透传给钩子函数）
   * @yields {{ type: string, ... }} SSE 事件
   *   除原有事件外，新增：
   *   - { type: "args_delta", index, name, chunk } — 工具参数流片段，由路由层消费
   */
  async function* think({ messages, model, apiKey, userId, context }) {
    const prompt = enhancePrompt
      ? enhancePrompt(systemPrompt, context)
      : systemPrompt;
    const toolDefs = enhanceToolDefs
      ? enhanceToolDefs(skills.definitions, context)
      : skills.definitions;
    const tools = toolDefs && toolDefs.length > 0 ? toolDefs : undefined;

    const conversationMessages = [
      { role: "system", content: prompt },
      ...messages,
    ];

    let toolHasRun = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // 流式调用 LLM，累积完整结果
      let doneResult = null;

      const llmOptions = tools ? { tools } : {};
      // 仅当工具尚未被调用过时，才强制使用指定工具；否则让模型自由决定（用于收尾文字回复）
      if (forceFirstTool && tools && !toolHasRun) {
        llmOptions.tool_choice = {
          type: "function",
          function: { name: forceFirstTool },
        };
      }

      for await (const streamEvent of chatStream(model, conversationMessages, apiKey, llmOptions)) {
        if (streamEvent.type === "args_delta") {
          // 透传工具参数增量给路由层（路由层据此提取 narrative 等字段实时推送）
          yield streamEvent;
        } else if (streamEvent.type === "done") {
          doneResult = streamEvent;
        }
        // content_delta 在工具调用场景下通常为空，不透传
      }

      const result = doneResult || { content: "", tool_calls: null };

      // 暴露本次 LLM 调用的 token 用量（供路由层落库）
      if (result.usage) {
        yield { type: "llm_usage", usage: result.usage, model };
      }

      // 没有 tool_calls → 推理完成，返回最终回复
      if (!result.tool_calls || result.tool_calls.length === 0) {
        yield { type: "answer", content: result.content };
        return;
      }

      // 有 tool_calls → 通知前端正在思考（含完整参数供回退渲染）
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
        toolHasRun = true;

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
