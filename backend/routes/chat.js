/**
 * 对话路由 — 财务助理
 *
 * 通过 createBrain 工厂创建 financeBrain 实例，
 * 导出 financeRouter（挂载到 /api/finance-chat）。
 */

const express = require("express");
const { getModelInfo } = require("../services/llm");
const { createBrain } = require("../services/brain");
const { createSkillRegistry } = require("../services/skills/registry");
const {
  recordDefinition,
  queryDefinition,
  updateProfileDefinition,
  executeRecord,
  executeQuery,
  executeUpdateProfile,
} = require("../services/skills/finance-record");
const { findOrCreateUser, getUserCategories } = require("../services/dao/finance-dao");

// ===== 系统提示词 =====

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
   - 返回月度趋势数据，可用于分析支出变化
   - 返回预算使用情况，可提醒用户预算消耗进度
   - 拿到查询结果后，请用简洁易懂的方式为用户分析总结，善用趋势数据给出洞察

不涉及工具的普通对话（如财务建议、理财知识），直接回复即可，不要强行调用工具。

3. update_profile 工具 — 修改用户的个人资料：
   - 当用户想改名字、昵称时：传入 name 字段
   - 当用户想设置或修改月预算时：传入 monthly_budget 字段（0 表示清除）
   - 当用户想增加/删除/修改支出分类时：基于用户资料中的当前分类列表调整后，将完整的新列表传入 expense_categories 字段`;

// ===== 组装技能集和 Brain 实例 =====

const financeSkills = createSkillRegistry({
  record: {
    definition: recordDefinition,
    execute: executeRecord,
  },
  query: {
    definition: queryDefinition,
    execute: executeQuery,
  },
  update_profile: {
    definition: updateProfileDefinition,
    execute: executeUpdateProfile,
  },
});

const financeBrain = createBrain({ systemPrompt: FINANCE_SYSTEM_PROMPT, skills: financeSkills });

// ===== 用户解析 =====

async function resolveUserId(req) {
  const openid = req.headers["x-wx-openid"] || null;
  const anonToken = req.headers["x-anon-token"] || null;

  if (!openid && !anonToken) {
    return null;
  }

  return findOrCreateUser(openid, anonToken);
}

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

      // 解析用户身份
      var userId = await resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "缺少用户标识，请刷新页面重试" });
      }

      // 从数据库加载用户自定义分类，合并到 profile 中
      if (profile) {
        const dbCategories = await getUserCategories(userId);
        if (dbCategories.length > 0) {
          profile.expenseCategories = dbCategories;
        }
      }

      // SSE 流式响应
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      for await (const event of brain.think({ messages, model, apiKey, profile, userId })) {
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

const financeRouter = express.Router();
financeRouter.post("/completions", createCompletionsHandler(financeBrain, "FinanceChat"));

module.exports = { financeRouter };
