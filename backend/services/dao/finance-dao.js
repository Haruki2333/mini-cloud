/**
 * 财务数据访问层
 * 封装所有数据库 CRUD 操作和月度汇总更新
 */

const { Op } = require("sequelize");

// 延迟加载模型，避免循环依赖
function getModels() {
  const db = require("../db");
  return {
    User: db.User,
    FinanceRecord: db.FinanceRecord,
    UserCategory: db.UserCategory,
    MonthlySummary: db.MonthlySummary,
    sequelize: db.getSequelize(),
  };
}

// ===== 用户管理 =====

/**
 * 根据 openid 或 anon_token 查找或创建用户
 * @returns {number} userId
 */
async function findOrCreateUser(openid, anonToken) {
  const { User } = getModels();

  if (openid) {
    const [user] = await User.findOrCreate({
      where: { openid },
      defaults: { openid },
    });
    return user.id;
  }

  if (anonToken) {
    const [user] = await User.findOrCreate({
      where: { anon_token: anonToken },
      defaults: { anon_token: anonToken },
    });
    return user.id;
  }

  throw new Error("缺少用户标识（openid 或 anon_token）");
}

// ===== 记录操作 =====

/**
 * 批量创建财务记录
 * @param {number} userId
 * @param {Array} records - 验证后的记录数组 [{ type, amount, category?, source?, description?, period?, date }]
 * @returns {Array} 创建结果数组
 */
async function createRecords(userId, records) {
  const { FinanceRecord } = getModels();
  const results = [];
  const affectedMonths = new Set();

  for (const item of records) {
    const row = await FinanceRecord.create({
      user_id: userId,
      type: item.type,
      amount: item.amount,
      category: item.category || null,
      source: item.source || null,
      description: item.description || null,
      period: item.period || null,
      record_date: item.date,
    });

    affectedMonths.add(item.date.slice(0, 7));

    const record = {
      id: row.id,
      amount: Number(row.amount),
      date: row.record_date,
      createdAt: row.created_at,
    };

    if (item.type === "expense") {
      record.category = row.category;
      record.description = row.description;
      results.push({
        type: "expense",
        success: true,
        message: `已记录支出：${row.description} ¥${row.amount}（${row.category}）`,
        record,
      });
    } else if (item.type === "income") {
      record.source = row.source;
      record.description = row.description;
      results.push({
        type: "income",
        success: true,
        message: `已记录收入：${row.description} ¥${row.amount}（${row.source}）`,
        record,
      });
    } else if (item.type === "budget") {
      record.category = row.category;
      record.period = row.period;
      results.push({
        type: "budget",
        success: true,
        message: `已设置预算：${row.category} 每${row.period} ¥${row.amount}`,
        record,
      });
    }
  }

  // 异步刷新受影响月份的汇总（不阻塞返回）
  for (const month of affectedMonths) {
    refreshMonthlySummary(userId, month).catch((err) =>
      console.error("[DAO] 刷新月度汇总失败:", err.message)
    );
  }

  return results;
}

/**
 * 查询财务记录
 * @param {number} userId
 * @param {object} params - { date?, type?, month? }
 * @returns {object} 查询结果（含明细和汇总）
 */
async function queryRecords(userId, params) {
  const { FinanceRecord } = getModels();
  const date = params.date || null;
  const month = params.month || null;
  const type = params.type || "all";
  const typesToQuery = type === "all" ? ["expense", "income", "budget"] : [type];

  // 构建查询条件
  const where = { user_id: userId };
  if (typesToQuery.length === 1) {
    where.type = typesToQuery[0];
  } else {
    where.type = { [Op.in]: typesToQuery };
  }

  if (date) {
    where.record_date = date;
  } else if (month) {
    where.record_date = {
      [Op.gte]: month + "-01",
      [Op.lte]: month + "-31",
    };
  }

  const rows = await FinanceRecord.findAll({
    where,
    order: [["record_date", "DESC"], ["created_at", "DESC"]],
    raw: true,
  });

  // 组织结果
  const result = {};
  for (const t of typesToQuery) {
    const filtered = rows.filter((r) => r.type === t);
    result[t] = {
      count: filtered.length,
      records: filtered.map((r) => formatRecord(r)),
    };
  }

  // 计算汇总统计
  const { expenses, totalExpense, totalIncome, expenseByCategory, incomeBySource } = aggregateRecords(rows);
  const budgets = rows.filter((r) => r.type === "budget");

  // 计算预算使用情况
  const budgetUsage = {};
  for (const b of budgets) {
    const spent = expenseByCategory[b.category] || 0;
    const budgetAmount = Number(b.amount);
    budgetUsage[b.category] = {
      budget: budgetAmount,
      spent,
      remaining: budgetAmount - spent,
      pct: budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0,
    };
  }

  // 计算日均支出
  let avgDailyExpense = 0;
  if (expenses.length > 0) {
    const dates = new Set(expenses.map((r) => r.record_date));
    avgDailyExpense = Math.round((totalExpense / dates.size) * 100) / 100;
  }

  // 找出支出最高的分类
  let topCategory = null;
  let topAmount = 0;
  for (const [cat, amt] of Object.entries(expenseByCategory)) {
    if (amt > topAmount) {
      topCategory = cat;
      topAmount = amt;
    }
  }

  const response = {
    success: true,
    date: date || (month ? month : "全部"),
    summary: {
      totalExpense,
      totalIncome,
      netIncome: totalIncome - totalExpense,
      expenseByCategory,
      incomeBySource,
      avgDailyExpense,
      topCategory,
    },
    ...result,
  };

  // 如果有预算数据，添加预算使用情况
  if (Object.keys(budgetUsage).length > 0) {
    response.summary.budgetUsage = budgetUsage;
  }

  // 查询月度趋势（最近 6 个月）
  const queryMonth = month || (date ? date.slice(0, 7) : new Date().toISOString().slice(0, 7));
  const trends = await getMonthlySummaryTrends(userId, queryMonth, 6);
  if (trends.length > 0) {
    response.trends = trends;
  }

  return response;
}

/**
 * 获取最近 N 个月的月度趋势
 */
async function getMonthlySummaryTrends(userId, currentMonth, count) {
  const { MonthlySummary } = getModels();

  // 计算起始月份
  const [year, mon] = currentMonth.split("-").map(Number);
  const startDate = new Date(year, mon - count, 1);
  const startMonth = startDate.toISOString().slice(0, 7);

  const summaries = await MonthlySummary.findAll({
    where: {
      user_id: userId,
      month: { [Op.gte]: startMonth, [Op.lte]: currentMonth },
    },
    order: [["month", "ASC"]],
    raw: true,
  });

  return summaries.map((s) => ({
    month: s.month,
    expense: Number(s.total_expense),
    income: Number(s.total_income),
    netIncome: Number(s.net_income),
    recordCount: s.record_count,
  }));
}

// ===== 用户资料管理 =====

/**
 * 更新用户资料
 */
async function updateProfile(userId, params) {
  const { User, UserCategory, FinanceRecord } = getModels();
  const updates = {};
  const messages = [];

  if (params.name !== undefined) {
    const name = String(params.name).trim();
    await User.update({ name }, { where: { id: userId } });
    updates.name = name;
    messages.push(`名称更新为"${name}"`);
  }

  if (params.monthly_budget !== undefined) {
    const amount = Number(params.monthly_budget);

    // 删除该用户的旧月预算记录
    await FinanceRecord.destroy({
      where: { user_id: userId, type: "budget", category: "月预算" },
    });

    if (amount > 0) {
      await FinanceRecord.create({
        user_id: userId,
        type: "budget",
        amount,
        category: "月预算",
        period: "月",
        record_date: new Date().toISOString().slice(0, 10),
      });
      messages.push(`月预算设为 ¥${amount}`);
    } else {
      messages.push("月预算已清除");
    }
    updates.monthly_budget = amount;
  }

  if (params.expense_categories !== undefined) {
    const categories = params.expense_categories
      .map((c) => String(c).trim())
      .filter(Boolean);

    // 删除旧分类，插入新分类
    await UserCategory.destroy({ where: { user_id: userId } });
    if (categories.length > 0) {
      await UserCategory.bulkCreate(
        categories.map((name, i) => ({
          user_id: userId,
          name,
          sort_order: i,
        }))
      );
    }
    updates.expense_categories = categories;
    messages.push(`支出分类更新为：${categories.join("、")}`);
  }

  if (messages.length === 0) {
    return { success: false, message: "未提供任何需要更新的字段" };
  }

  return { success: true, updates, message: messages.join("；") };
}

/**
 * 获取用户完整资料（name、expenseCategories、budgets）
 * @param {number} userId
 * @returns {{ name: string, expenseCategories: string[], budgets: Array, monthly_budget: number }}
 */
async function getUserProfile(userId) {
  const { User, UserCategory, FinanceRecord } = getModels();

  const [user, categories, budgetRows] = await Promise.all([
    User.findByPk(userId, { raw: true }),
    UserCategory.findAll({
      where: { user_id: userId },
      order: [["sort_order", "ASC"]],
      raw: true,
    }),
    FinanceRecord.findAll({
      where: { user_id: userId, type: "budget" },
      raw: true,
    }),
  ]);

  const monthlyBudgetRow = budgetRows.find((b) => b.category === "月预算");

  return {
    name: (user && user.name) || "",
    expenseCategories: categories.map((c) => c.name),
    budgets: budgetRows.map((b) => ({
      id: b.id,
      category: b.category,
      amount: Number(b.amount),
      period: b.period,
      date: b.record_date,
    })),
    monthly_budget: monthlyBudgetRow ? Number(monthlyBudgetRow.amount) : 0,
  };
}

/**
 * 修改指定财务记录的字段
 * @param {number} userId
 * @param {number} recordId
 * @param {object} updates - 允许修改的字段 { amount?, category?, description?, source?, period?, date? }
 */
async function updateRecord(userId, recordId, updates) {
  const { FinanceRecord } = getModels();

  const record = await FinanceRecord.findOne({
    where: { id: recordId, user_id: userId },
    raw: true,
  });

  if (!record) {
    return { success: false, message: `记录 #${recordId} 不存在或无权操作` };
  }

  const affectedMonths = new Set([record.record_date.slice(0, 7)]);
  const updateFields = {};

  if (updates.amount !== undefined) updateFields.amount = Number(updates.amount);
  if (updates.category !== undefined) updateFields.category = updates.category;
  if (updates.description !== undefined) updateFields.description = updates.description;
  if (updates.source !== undefined) updateFields.source = updates.source;
  if (updates.period !== undefined) updateFields.period = updates.period;
  if (updates.date !== undefined) {
    updateFields.record_date = updates.date;
    affectedMonths.add(updates.date.slice(0, 7));
  }

  if (Object.keys(updateFields).length === 0) {
    return { success: false, message: "未提供任何要更新的字段" };
  }

  await FinanceRecord.update(updateFields, { where: { id: recordId, user_id: userId } });

  for (const month of affectedMonths) {
    refreshMonthlySummary(userId, month).catch((err) =>
      console.error("[DAO] 刷新月度汇总失败:", err.message)
    );
  }

  return { success: true, message: `记录 #${recordId} 已更新`, updated: updateFields };
}

/**
 * 删除一条或多条财务记录
 * @param {number} userId
 * @param {number[]} recordIds
 */
async function deleteRecord(userId, recordIds) {
  const { FinanceRecord } = getModels();

  const records = await FinanceRecord.findAll({
    where: { id: { [Op.in]: recordIds }, user_id: userId },
    raw: true,
  });

  if (records.length === 0) {
    return { success: false, message: "未找到指定记录或无权操作" };
  }

  const affectedMonths = new Set(records.map((r) => r.record_date.slice(0, 7)));
  const foundIds = records.map((r) => r.id);
  const notFoundIds = recordIds.filter((id) => !foundIds.includes(id));

  await FinanceRecord.destroy({ where: { id: { [Op.in]: foundIds }, user_id: userId } });

  for (const month of affectedMonths) {
    refreshMonthlySummary(userId, month).catch((err) =>
      console.error("[DAO] 刷新月度汇总失败:", err.message)
    );
  }

  const messages = [`已删除 ${foundIds.length} 条记录`];
  if (notFoundIds.length > 0) {
    messages.push(`${notFoundIds.length} 条记录未找到（ID: ${notFoundIds.join(", ")}）`);
  }

  return { success: true, deleted: foundIds, notFound: notFoundIds, message: messages.join("，") };
}

// ===== 月度汇总刷新 =====

/**
 * 重新计算指定用户指定月份的汇总数据
 */
async function refreshMonthlySummary(userId, month) {
  const { FinanceRecord, MonthlySummary } = getModels();

  const rows = await FinanceRecord.findAll({
    where: {
      user_id: userId,
      record_date: {
        [Op.gte]: month + "-01",
        [Op.lte]: month + "-31",
      },
    },
    raw: true,
  });

  const { totalExpense, totalIncome, expenseByCategory, incomeBySource } = aggregateRecords(rows);

  await MonthlySummary.upsert({
    user_id: userId,
    month,
    total_expense: totalExpense,
    total_income: totalIncome,
    net_income: totalIncome - totalExpense,
    expense_by_category: Object.keys(expenseByCategory).length > 0 ? expenseByCategory : null,
    income_by_source: Object.keys(incomeBySource).length > 0 ? incomeBySource : null,
    record_count: rows.length,
  });
}

// ===== 辅助函数 =====

/**
 * 对原始记录行进行聚合统计
 * @param {Array} rows - FinanceRecord 原始行（raw: true）
 */
function aggregateRecords(rows) {
  const expenses = rows.filter((r) => r.type === "expense");
  const incomes = rows.filter((r) => r.type === "income");
  const totalExpense = expenses.reduce((sum, r) => sum + Number(r.amount), 0);
  const totalIncome = incomes.reduce((sum, r) => sum + Number(r.amount), 0);
  const expenseByCategory = {};
  for (const r of expenses) {
    expenseByCategory[r.category] = (expenseByCategory[r.category] || 0) + Number(r.amount);
  }
  const incomeBySource = {};
  for (const r of incomes) {
    incomeBySource[r.source] = (incomeBySource[r.source] || 0) + Number(r.amount);
  }
  return { expenses, totalExpense, totalIncome, expenseByCategory, incomeBySource };
}

function formatRecord(row) {
  const record = {
    id: row.id,
    amount: Number(row.amount),
    date: row.record_date,
    createdAt: row.created_at,
  };

  if (row.type === "expense") {
    record.category = row.category;
    record.description = row.description;
  } else if (row.type === "income") {
    record.source = row.source;
    record.description = row.description;
  } else if (row.type === "budget") {
    record.category = row.category;
    record.period = row.period;
  }

  return record;
}

module.exports = {
  findOrCreateUser,
  createRecords,
  queryRecords,
  updateRecord,
  deleteRecord,
  updateProfile,
  getUserProfile,
};
