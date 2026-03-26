/**
 * 记录生活支出技能
 * 内存存储，重启后数据清空
 */

const records = [];
let nextId = 1;

const definition = {
  type: "function",
  function: {
    name: "record_expense",
    description:
      "记录一笔生活支出。当用户提到花钱、消费、买东西、付款等内容时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "金额（元）" },
        category: {
          type: "string",
          description: "支出分类",
          enum: ["餐饮", "交通", "购物", "娱乐", "医疗", "居住", "其他"],
        },
        description: { type: "string", description: "简要描述这笔支出" },
        date: {
          type: "string",
          description: "日期，格式 YYYY-MM-DD，默认今天",
        },
      },
      required: ["amount", "category", "description"],
    },
  },
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTodaySummary(date) {
  const dayRecords = records.filter((r) => r.date === date);
  const total = dayRecords.reduce((sum, r) => sum + r.amount, 0);
  const byCategory = {};
  dayRecords.forEach((r) => {
    byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
  });
  return { total, byCategory, count: dayRecords.length };
}

async function execute(params) {
  const date = params.date || getToday();
  const record = {
    id: nextId++,
    amount: params.amount,
    category: params.category,
    description: params.description,
    date,
    createdAt: new Date().toISOString(),
  };
  records.push(record);

  const summary = getTodaySummary(date);
  return {
    success: true,
    message: `已记录支出：${record.description} ¥${record.amount}（${record.category}）`,
    todaySummary: summary,
  };
}

function getRecords(date) {
  if (date) return records.filter((r) => r.date === date);
  return records;
}

module.exports = { definition, execute, getRecords };
