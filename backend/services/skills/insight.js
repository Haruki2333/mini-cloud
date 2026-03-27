/**
 * 记录临时感悟技能
 * 内存存储，重启后数据清空
 */

const records = [];
let nextId = 1;

const definition = {
  type: "function",
  function: {
    name: "record_insight",
    description:
      "记录用户的临时感悟。当用户分享感悟、想法、灵感、反思、心得等内容时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "感悟内容" },
        tag: { type: "string", description: "标签或分类，如：生活、工作、读书等" },
        date: {
          type: "string",
          description: "日期，格式 YYYY-MM-DD，默认今天",
        },
      },
      required: ["content"],
    },
  },
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTodaySummary(date) {
  const dayRecords = records.filter((r) => r.date === date);
  const tags = {};
  dayRecords.forEach((r) => {
    if (r.tag) tags[r.tag] = (tags[r.tag] || 0) + 1;
  });
  return { count: dayRecords.length, tags };
}

async function execute(params) {
  const date = params.date || getToday();
  const record = {
    id: nextId++,
    content: params.content,
    tag: params.tag || null,
    date,
    createdAt: new Date().toISOString(),
  };
  records.push(record);

  const summary = getTodaySummary(date);
  const tagStr = record.tag ? `（${record.tag}）` : "";
  return {
    success: true,
    message: `已记录感悟${tagStr}：${record.content}`,
    todaySummary: summary,
  };
}

function getRecords(date) {
  if (date) return records.filter((r) => r.date === date);
  return records;
}

module.exports = { definition, execute, getRecords };
