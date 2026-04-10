/**
 * 对话路由 — 财务助理
 *
 * 通过 createBrain 工厂创建 financeBrain 实例，
 * 导出 financeRouter（挂载到 /api/finance-chat）。
 */

const express = require("express");
const { getModelInfo } = require("../services/core/llm");
const { createBrain } = require("../services/core/brain");
const { createSkillRegistry } = require("../services/core/skill-registry");
const {
  FINANCE_SYSTEM_PROMPT,
  enhancePrompt,
  enhanceToolDefs,
} = require("../services/finance-assistant/brain-config");
const {
  recordDefinition,
  queryDefinition,
  updateProfileDefinition,
  updateRecordDefinition,
  deleteRecordDefinition,
  executeRecord,
  executeQuery,
  executeUpdateProfile,
  executeUpdateRecord,
  executeDeleteRecord,
} = require("../services/finance-assistant/skills");
const {
  findOrCreateUser,
  queryRecords,
  updateRecord,
  deleteRecord,
  updateProfile,
  getUserProfile,
} = require("../services/finance-assistant/dao");

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
  update_record: {
    definition: updateRecordDefinition,
    execute: executeUpdateRecord,
  },
  delete_record: {
    definition: deleteRecordDefinition,
    execute: executeDeleteRecord,
  },
});

const financeBrain = createBrain({
  systemPrompt: FINANCE_SYSTEM_PROMPT,
  skills: financeSkills,
  enhancePrompt,
  enhanceToolDefs,
});

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
      const apiKey = req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ error: "缺少 API Key，请在个人资料页配置" });
      }

      const { messages } = req.body;
      let model = req.body.model || "qwen3.5-plus";
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "消息列表不能为空" });
      }
      const modelInfo = getModelInfo(model);
      if (!modelInfo) {
        return res.status(400).json({ error: "不支持的模型: " + model });
      }

      // 解析用户身份
      const userId = await resolveUserId(req);
      if (!userId) {
        return res.status(401).json({ error: "缺少用户标识，请刷新页面重试" });
      }

      // 从数据库加载完整用户资料
      const profile = await getUserProfile(userId);

      // SSE 流式响应
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      for await (const event of brain.think({ messages, model, apiKey, userId, context: profile })) {
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

// ===== 数据查询接口（供前端直接读取，不经过 LLM） =====

// GET /api/finance-chat/data/summary?month=YYYY-MM
async function handleGetSummary(req, res) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const data = await queryRecords(userId, { month, type: "all" });

    res.json({
      success: true,
      month,
      expense: {
        total: data.summary.totalExpense,
        byCategory: data.summary.expenseByCategory,
      },
      income: {
        total: data.summary.totalIncome,
      },
      netIncome: data.summary.netIncome,
    });
  } catch (err) {
    console.error("[DataAPI] summary 查询失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/finance-chat/data/records?month=YYYY-MM&type=all|expense|income
async function handleGetRecords(req, res) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const type = req.query.type || "all";
    const data = await queryRecords(userId, { month, type });

    // 将各类型记录合并，并附加 _kind 字段
    const records = [];
    for (const t of ["expense", "income"]) {
      if (data[t] && data[t].records) {
        for (const r of data[t].records) {
          records.push(Object.assign({}, r, { _kind: t }));
        }
      }
    }

    res.json({ success: true, records });
  } catch (err) {
    console.error("[DataAPI] records 查询失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/finance-chat/data/profile
async function handleGetProfile(req, res) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const profile = await getUserProfile(userId);
    res.json({
      success: true,
      name: profile.name,
      monthly_budget: profile.monthly_budget,
      expense_categories: profile.expenseCategories,
    });
  } catch (err) {
    console.error("[DataAPI] profile 查询失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/finance-chat/data/profile
async function handlePutProfile(req, res) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const { name, monthly_budget, expense_categories } = req.body;
    const params = {};
    if (name !== undefined) params.name = name;
    if (monthly_budget !== undefined) params.monthly_budget = monthly_budget;
    if (expense_categories !== undefined) params.expense_categories = expense_categories;

    const result = await updateProfile(userId, params);
    res.json(result);
  } catch (err) {
    console.error("[DataAPI] profile 更新失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/finance-chat/data/records/:id — 直接修改记录（供详情页 UI 调用）
async function handlePutRecord(req, res) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const recordId = Number(req.params.id);
    if (!recordId) {
      return res.status(400).json({ error: "无效的记录 ID" });
    }

    const { amount, category, description, source, period, date } = req.body;
    const updates = {};
    if (amount !== undefined) updates.amount = amount;
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (source !== undefined) updates.source = source;
    if (period !== undefined) updates.period = period;
    if (date !== undefined) updates.date = date;

    const result = await updateRecord(userId, recordId, updates);
    res.json(result);
  } catch (err) {
    console.error("[DataAPI] record 修改失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/finance-chat/data/records/:id — 直接删除记录（供详情页 UI 调用）
async function handleDeleteRecord(req, res) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const recordId = Number(req.params.id);
    if (!recordId) {
      return res.status(400).json({ error: "无效的记录 ID" });
    }

    const result = await deleteRecord(userId, [recordId]);
    res.json(result);
  } catch (err) {
    console.error("[DataAPI] record 删除失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ===== 路由 =====

const financeRouter = express.Router();
financeRouter.post("/completions", createCompletionsHandler(financeBrain, "FinanceChat"));
financeRouter.get("/data/summary", handleGetSummary);
financeRouter.get("/data/records", handleGetRecords);
financeRouter.get("/data/profile", handleGetProfile);
financeRouter.put("/data/profile", handlePutProfile);
financeRouter.put("/data/records/:id", handlePutRecord);
financeRouter.delete("/data/records/:id", handleDeleteRecord);

module.exports = { financeRouter };
