/**
 * 统一记录技能
 * 合并 expense / food / todo / insight 四种记录类型
 * 支持一次调用批量存储多条记录，减少 token 消耗
 * 内存存储，重启后数据清空
 */

const stores = {
  expense: { records: [], nextId: 1 },
  food: { records: [], nextId: 1 },
  todo: { records: [], nextId: 1 },
  insight: { records: [], nextId: 1 },
};

const definition = {
  type: "function",
  function: {
    name: "record",
    description:
      "记录用户的生活数据，支持一次记录多条。类型：expense(支出)、food(食物)、todo(待办)、insight(感悟)。",
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
                enum: ["expense", "food", "todo", "insight"],
                description: "记录类型",
              },
              date: {
                type: "string",
                description: "日期 YYYY-MM-DD，默认今天",
              },
              amount: {
                type: "number",
                description: "金额，元（expense 必填）",
              },
              category: {
                type: "string",
                enum: ["餐饮", "交通", "购物", "娱乐", "医疗", "居住", "其他"],
                description: "支出分类（expense 必填）",
              },
              description: {
                type: "string",
                description: "支出描述（expense 必填）",
              },
              food_name: {
                type: "string",
                description: "食物名称（food 必填）",
              },
              meal_type: {
                type: "string",
                enum: ["早餐", "午餐", "晚餐", "加餐"],
                description: "餐次（food 必填）",
              },
              title: {
                type: "string",
                description: "待办内容（todo 必填）",
              },
              priority: {
                type: "string",
                enum: ["高", "中", "低"],
                description: "优先级（todo 可选，默认中）",
              },
              content: {
                type: "string",
                description: "感悟内容（insight 必填）",
              },
              tag: {
                type: "string",
                description: "标签（insight 可选）",
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
  };
}

function handleFood(item, date) {
  if (!item.food_name || !item.meal_type) {
    return { type: "food", success: false, message: "food 需要 food_name、meal_type" };
  }
  const store = stores.food;
  const record = {
    id: store.nextId++,
    food_name: item.food_name,
    meal_type: item.meal_type,
    date,
    createdAt: new Date().toISOString(),
  };
  store.records.push(record);
  return {
    type: "food",
    success: true,
    message: `已记录食物：${record.food_name}（${record.meal_type}）`,
  };
}

function handleTodo(item, date) {
  if (!item.title) {
    return { type: "todo", success: false, message: "todo 需要 title" };
  }
  const store = stores.todo;
  const record = {
    id: store.nextId++,
    title: item.title,
    priority: item.priority || "中",
    date,
    createdAt: new Date().toISOString(),
  };
  store.records.push(record);
  return {
    type: "todo",
    success: true,
    message: `已记录待办：${record.title}（优先级：${record.priority}）`,
  };
}

function handleInsight(item, date) {
  if (!item.content) {
    return { type: "insight", success: false, message: "insight 需要 content" };
  }
  const store = stores.insight;
  const record = {
    id: store.nextId++,
    content: item.content,
    tag: item.tag || null,
    date,
    createdAt: new Date().toISOString(),
  };
  store.records.push(record);
  const tagStr = record.tag ? `（${record.tag}）` : "";
  return {
    type: "insight",
    success: true,
    message: `已记录感悟${tagStr}：${record.content}`,
  };
}

const handlers = {
  expense: handleExpense,
  food: handleFood,
  todo: handleTodo,
  insight: handleInsight,
};

// ===== 主执行函数 =====

async function execute(params) {
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

// ===== 查询接口 =====

function getRecords(type, date) {
  const store = stores[type];
  if (!store) return [];
  if (date) return store.records.filter((r) => r.date === date);
  return store.records;
}

module.exports = { definition, execute, getRecords };
