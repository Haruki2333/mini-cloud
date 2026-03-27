/**
 * 记录待办事项技能
 * 内存存储，重启后数据清空
 */

const records = [];
let nextId = 1;

const definition = {
  type: "function",
  function: {
    name: "record_todo",
    description:
      "记录一条待办事项。当用户提到要做的事、任务、计划、提醒等内容时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "待办事项内容" },
        priority: {
          type: "string",
          description: "优先级",
          enum: ["高", "中", "低"],
        },
        date: {
          type: "string",
          description: "日期，格式 YYYY-MM-DD，默认今天",
        },
      },
      required: ["title"],
    },
  },
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTodaySummary(date) {
  const dayRecords = records.filter((r) => r.date === date);
  const byPriority = {};
  dayRecords.forEach((r) => {
    byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  });
  return { count: dayRecords.length, byPriority };
}

async function execute(params) {
  const date = params.date || getToday();
  const record = {
    id: nextId++,
    title: params.title,
    priority: params.priority || "中",
    date,
    createdAt: new Date().toISOString(),
  };
  records.push(record);

  const summary = getTodaySummary(date);
  return {
    success: true,
    message: `已记录待办：${record.title}（优先级：${record.priority}）`,
    todaySummary: summary,
  };
}

function getRecords(date) {
  if (date) return records.filter((r) => r.date === date);
  return records;
}

module.exports = { definition, execute, getRecords };
