/**
 * 对话路由 — 生活助理 & 财务助理
 *
 * 通过 createBrain 工厂分别创建两个 Brain 实例，
 * 通过 createCompletionsHandler 消除路由处理器的重复代码。
 * 导出 lifeRouter（挂载到 /api/chat）和 financeRouter（挂载到 /api/finance-chat）。
 */

const express = require("express");
const { getModelInfo } = require("../services/llm");
const { createBrain } = require("../services/brain");
const { createSkillRegistry } = require("../services/skills/registry");
const lifeRecord = require("../services/skills/life-record");
const financeRecord = require("../services/skills/finance-record");

// ===== 系统提示词 =====

const LIFE_SYSTEM_PROMPT = `你是「光明生活助理」，一个温暖友善、简洁实用的 AI 助手。
你的职责是帮助用户处理日常生活中的各种问题，包括但不限于：生活建议、知识问答、日程规划、情感支持等。
回复要求：
- 简洁明了，避免冗长
- 语气温暖亲切，像一个靠谱的朋友
- 如果用户提供了个人资料，适当结合用户信息给出个性化建议
- 使用中文回复

你可以使用 record 工具来帮助用户记录生活数据，records 数组中每条记录通过 type 区分：
- type="expense": 当用户提到花钱、消费、买东西、付款等支出相关内容时
- type="food": 当用户提到吃了什么、饮食相关内容时
- type="todo": 当用户提到待办、要做的事、任务、计划、提醒等内容时
- type="insight": 当用户分享感悟、想法、灵感、反思、心得等内容时
如果用户的消息同时涉及多种记录（如"中午吃拉面花了35"），应在一次 record 调用的 records 数组中包含多条记录。
不涉及工具的普通对话，直接回复即可，不要强行调用工具。`;

const FINANCE_SYSTEM_PROMPT = `你是「光明财务助理」，一个专业、简洁、值得信赖的个人财务 AI 助手。
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

// ===== 组装技能集和 Brain 实例 =====

const lifeSkills = createSkillRegistry({
  record: lifeRecord,
});

const financeSkills = createSkillRegistry({
  record: {
    definition: financeRecord.recordDefinition,
    execute: financeRecord.executeRecord,
  },
  query: {
    definition: financeRecord.queryDefinition,
    execute: financeRecord.executeQuery,
  },
});

const lifeBrain = createBrain({ systemPrompt: LIFE_SYSTEM_PROMPT, skills: lifeSkills });
const financeBrain = createBrain({ systemPrompt: FINANCE_SYSTEM_PROMPT, skills: financeSkills });

// ===== 通用 SSE 处理函数 =====

function createCompletionsHandler(brain, logTag) {
  return async (req, res) => {
    try {
      var apiKey = req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ error: "缺少 API Key，请在个人资料页配置" });
      }

      var { messages, model, profile } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "消息列表不能为空" });
      }

      model = model || "qwen3.5-plus";
      var modelInfo = getModelInfo(model);
      if (!modelInfo) {
        return res.status(400).json({ error: "不支持的模型: " + model });
      }

      // SSE 流式响应
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      for await (const event of brain.think({ messages, model, apiKey, profile })) {
        res.write("data: " + JSON.stringify(event) + "\n\n");
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      console.error(`[${logTag}] 调用失败:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        res.write(
          "data: " + JSON.stringify({ type: "error", message: err.message }) + "\n\n"
        );
        res.end();
      }
    }
  };
}

// ===== 路由 =====

const lifeRouter = express.Router();
lifeRouter.post("/completions", createCompletionsHandler(lifeBrain, "Chat"));

const financeRouter = express.Router();
financeRouter.post("/completions", createCompletionsHandler(financeBrain, "FinanceChat"));

module.exports = { lifeRouter, financeRouter };
