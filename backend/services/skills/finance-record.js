/**
 * 财务记录技能
 * 支持 expense(支出) / income(收入) / budget(预算) 三种记录类型
 * 数据持久化到 MySQL
 */

const dao = require("../dao/finance-dao");

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
      "查询用户的财务记录和统计数据。可按日期和类型筛选，返回记录明细、汇总统计和月度趋势。",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "查询日期 YYYY-MM-DD，不传则查询全部",
        },
        month: {
          type: "string",
          description: "查询月份 YYYY-MM，按月筛选",
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

// ===== record 主执行函数 =====

async function executeRecord(params, userId) {
  const items = params.records;
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, message: "records 数组不能为空" };
  }

  // 验证每条记录
  const validatedRecords = [];
  const errors = [];

  for (const item of items) {
    const date = item.date || getToday();

    if (item.type === "expense") {
      if (!item.amount || !item.category || !item.description) {
        errors.push({ type: "expense", success: false, message: "expense 需要 amount、category、description" });
        continue;
      }
    } else if (item.type === "income") {
      if (!item.amount || !item.source || !item.description) {
        errors.push({ type: "income", success: false, message: "income 需要 amount、source、description" });
        continue;
      }
    } else if (item.type === "budget") {
      if (!item.category || !item.amount || !item.period) {
        errors.push({ type: "budget", success: false, message: "budget 需要 category、amount、period" });
        continue;
      }
    } else {
      errors.push({ type: item.type, success: false, message: `未知类型: ${item.type}` });
      continue;
    }

    validatedRecords.push({ ...item, date });
  }

  if (validatedRecords.length === 0) {
    return { success: false, results: errors };
  }

  const results = await dao.createRecords(userId, validatedRecords);
  const allResults = [...errors, ...results];
  const allSuccess = allResults.every((r) => r.success);

  return { success: allSuccess, results: allResults };
}

// ===== query 执行函数 =====

async function executeQuery(params, userId) {
  return dao.queryRecords(userId, params);
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

async function executeUpdateProfile(params, userId) {
  return dao.updateProfile(userId, params);
}

// ===== update_record 工具定义 =====

const updateRecordDefinition = {
  type: "function",
  function: {
    name: "update_record",
    description:
      "修改指定财务记录的字段（金额、分类、描述、日期等）。需先用 query 工具找到记录 ID，再调用本工具。",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "number",
          description: "要修改的记录 ID（从 query 结果中获取）",
        },
        date: {
          type: "string",
          description: "新日期 YYYY-MM-DD",
        },
        amount: {
          type: "number",
          description: "新金额（元）",
        },
        category: {
          type: "string",
          description: "新分类（expense/budget 记录适用）",
        },
        description: {
          type: "string",
          description: "新描述（expense/income 记录适用）",
        },
        source: {
          type: "string",
          enum: ["工资", "兼职", "投资", "红包", "报销", "其他"],
          description: "新收入来源（income 记录适用）",
        },
        period: {
          type: "string",
          enum: ["日", "周", "月"],
          description: "新预算周期（budget 记录适用）",
        },
      },
      required: ["id"],
    },
  },
};

async function executeUpdateRecord(params, userId) {
  const { id, ...updates } = params;
  if (!id) {
    return { success: false, message: "缺少记录 ID" };
  }
  return dao.updateRecord(userId, id, updates);
}

// ===== delete_record 工具定义 =====

const deleteRecordDefinition = {
  type: "function",
  function: {
    name: "delete_record",
    description:
      "删除一条或多条财务记录。需先用 query 工具找到记录 ID，再调用本工具。删除操作不可撤销，请在执行前向用户确认。",
    parameters: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "number" },
          description: "要删除的记录 ID 数组（从 query 结果中获取）",
        },
      },
      required: ["ids"],
    },
  },
};

async function executeDeleteRecord(params, userId) {
  const ids = params.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, message: "ids 数组不能为空" };
  }
  return dao.deleteRecord(userId, ids);
}

module.exports = {
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
};
