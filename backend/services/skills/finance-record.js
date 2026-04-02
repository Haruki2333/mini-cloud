/**
 * 财务记录技能
 * 支持 expense(支出) / income(收入) / budget(预算) 三种记录类型
 * 内存存储，重启后数据清空
 */

const stores = {
  expense: { records: [], nextId: 1 },
  income: { records: [], nextId: 1 },
  budget: { records: [], nextId: 1 },
};

// ===== record 工具定义 =====

const recordDefinition = {
  type: "function",
  function: {
    name: "record",
    description:
      "记录用户的财务数据，支持一次记录多条。类型：expense(支出)、income(收入)、budget(预算目标)。",
    parameters: {
      type: "object",
      properties: {
        records: {
          type: "array",
          description: "要记录的条目数组",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["expense", "income", "budget"],
                description: "记录类型",
              },
              date: {
                type: "string",
                description: "日期 YYYY-MM-DD，默认今天",
              },
              amount: {
                type: "number",
                description: "金额，元（必填）",
              },
              category: {
                type: "string",
                enum: ["餐饮", "交通", "购物", "娱乐", "医疗", "居住", "教育", "通讯", "其他"],
                description: "分类（expense/budget 必填）",
              },
              description: {
                type: "string",
                description: "描述（expense/income 必填）",
              },
              source: {
                type: "string",
                enum: ["工资", "兼职", "投资", "红包", "报销", "其他"],
                description: "收入来源（income 必填）",
              },
              period: {
                type: "string",
                enum: ["日", "周", "月"],
                description: "预算周期（budget 必填）",
              },
            },
            required: ["type"],
          },
        },
      },
      required: ["records"],
    },
  },
};

// ===== query 工具定义 =====

const queryDefinition = {
  type: "function",
  function: {
    name: "query",
    description:
      "查询用户的财务记录和统计数据。可按日期和类型筛选，返回记录明细和汇总统计。",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "查询日期 YYYY-MM-DD，不传则查询全部",
        },
        type: {
          type: "string",
          enum: ["expense", "income", "budget", "all"],
          description: "记录类型，默认 all",
        },
      },
    },
  },
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// ===== 各类型的处理器 =====

function handleExpense(item, date) {
  if (!item.amount || !item.category || !item.description) {
    return { type: "expense", success: false, message: "expense 需要 amount、category、description" };
  }
  const store = stores.expense;
  const record = {
    id: store.nextId++,
    amount: item.amount,
    category: item.category,
    description: item.description,
    date,
    createdAt: new Date().toISOString(),
  };
  store.records.push(record);
  return {
    type: "expense",
    success: true,
    message: `已记录支出：${record.description} ¥${record.amount}（${record.category}）`,
    record,
  };
}

function handleIncome(item, date) {
  if (!item.amount || !item.source || !item.description) {
    return { type: "income", success: false, message: "income 需要 amount、source、description" };
  }
  const store = stores.income;
  const record = {
    id: store.nextId++,
    amount: item.amount,
    source: item.source,
    description: item.description,
    date,
    createdAt: new Date().toISOString(),
  };
  store.records.push(record);
  return {
    type: "income",
    success: true,
    message: `已记录收入：${record.description} ¥${record.amount}（${record.source}）`,
    record,
  };
}

function handleBudget(item, date) {
  if (!item.category || !item.amount || !item.period) {
    return { type: "budget", success: false, message: "budget 需要 category、amount、period" };
  }
  const store = stores.budget;
  const record = {
    id: store.nextId++,
    category: item.category,
    amount: item.amount,
    period: item.period,
    date,
    createdAt: new Date().toISOString(),
  };
  store.records.push(record);
  return {
    type: "budget",
    success: true,
    message: `已设置预算：${record.category} 每${record.period} ¥${record.amount}`,
    record,
  };
}

const handlers = {
  expense: handleExpense,
  income: handleIncome,
  budget: handleBudget,
};

// ===== record 主执行函数 =====

async function executeRecord(params) {
  const items = params.records;
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: "records 数组不能为空" };
  }

  const results = [];
  let allSuccess = true;

  for (const item of items) {
    const handler = handlers[item.type];
    if (!handler) {
      results.push({ type: item.type, success: false, message: `未知类型: ${item.type}` });
      allSuccess = false;
      continue;
    }
    const date = item.date || getToday();
    const result = handler(item, date);
    if (!result.success) allSuccess = false;
    results.push(result);
  }

  return { success: allSuccess, results };
}

// ===== query 执行函数 =====

async function executeQuery(params) {
  const date = params.date || null;
  const type = params.type || "all";
  const typesToQuery = type === "all" ? ["expense", "income", "budget"] : [type];

  const result = {};

  for (const t of typesToQuery) {
    const store = stores[t];
    if (!store) continue;
    const records = date
      ? store.records.filter((r) => r.date === date)
      : store.records;
    result[t] = { count: records.length, records };
  }

  // 计算汇总统计
  const expenses = result.expense ? result.expense.records : [];
  const incomes = result.income ? result.income.records : [];

  const totalExpense = expenses.reduce((sum, r) => sum + r.amount, 0);
  const totalIncome = incomes.reduce((sum, r) => sum + r.amount, 0);

  const expenseByCategory = {};
  for (const r of expenses) {
    expenseByCategory[r.category] = (expenseByCategory[r.category] || 0) + r.amount;
  }

  const incomeBySource = {};
  for (const r of incomes) {
    incomeBySource[r.source] = (incomeBySource[r.source] || 0) + r.amount;
  }

  return {
    success: true,
    date: date || "全部",
    summary: {
      totalExpense,
      totalIncome,
      netIncome: totalIncome - totalExpense,
      expenseByCategory,
      incomeBySource,
    },
    ...result,
  };
}

// ===== 查询接口（供路由使用） =====

function getRecords(type, date) {
  const store = stores[type];
  if (!store) return [];
  if (date) return store.records.filter((r) => r.date === date);
  return store.records;
}

// ===== update_profile 工具定义 =====

const updateProfileDefinition = {
  type: "function",
  function: {
    name: "update_profile",
    description: "更新用户的个人资料，支持修改名称、月预算和支出分类",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "新的用户名称",
        },
        monthly_budget: {
          type: "number",
          description: "月预算金额（元），设为 0 表示清除预算",
        },
        expense_categories: {
          type: "array",
          items: { type: "string" },
          description:
            "完整的支出分类列表（将完整替换原有分类）。如需增减分类，应基于当前分类列表修改后传入",
        },
      },
    },
  },
};

async function executeUpdateProfile(params) {
  const updates = {};
  if (params.name !== undefined) updates.name = String(params.name).trim();
  if (params.monthly_budget !== undefined)
    updates.monthly_budget = Number(params.monthly_budget);
  if (params.expense_categories !== undefined)
    updates.expense_categories = params.expense_categories.map((c) => String(c).trim()).filter(Boolean);

  if (Object.keys(updates).length === 0) {
    return { success: false, message: "未提供任何需要更新的字段" };
  }

  const messages = [];
  if (updates.name !== undefined) messages.push(`名称更新为"${updates.name}"`);
  if (updates.monthly_budget !== undefined)
    messages.push(
      updates.monthly_budget > 0
        ? `月预算设为 ¥${updates.monthly_budget}`
        : "月预算已清除"
    );
  if (updates.expense_categories !== undefined)
    messages.push(`支出分类更新为：${updates.expense_categories.join("、")}`);

  return { success: true, updates, message: messages.join("；") };
}

module.exports = {
  recordDefinition,
  queryDefinition,
  updateProfileDefinition,
  executeRecord,
  executeQuery,
  executeUpdateProfile,
  getRecords,
};
