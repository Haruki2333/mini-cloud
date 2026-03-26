/**
 * 记录每日食物技能
 * 内存存储，重启后数据清空
 */

const records = [];
let nextId = 1;

const definition = {
  type: "function",
  function: {
    name: "record_food",
    description:
      "记录用户吃的食物。当用户提到吃了什么、饮食相关内容时调用此工具。",
    parameters: {
      type: "object",
      properties: {
        food_name: { type: "string", description: "食物名称" },
        meal_type: {
          type: "string",
          description: "餐次",
          enum: ["早餐", "午餐", "晚餐", "加餐"],
        },
        estimated_calories: {
          type: "number",
          description: "估算热量（千卡），如果能估算的话",
        },
        date: {
          type: "string",
          description: "日期，格式 YYYY-MM-DD，默认今天",
        },
      },
      required: ["food_name", "meal_type"],
    },
  },
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTodayMeals(date) {
  const dayRecords = records.filter((r) => r.date === date);
  const byMeal = {};
  dayRecords.forEach((r) => {
    if (!byMeal[r.meal_type]) byMeal[r.meal_type] = [];
    byMeal[r.meal_type].push(r.food_name);
  });
  const totalCalories = dayRecords.reduce(
    (sum, r) => sum + (r.estimated_calories || 0),
    0
  );
  return { byMeal, totalCalories, count: dayRecords.length };
}

async function execute(params) {
  const date = params.date || getToday();
  const record = {
    id: nextId++,
    food_name: params.food_name,
    meal_type: params.meal_type,
    estimated_calories: params.estimated_calories || null,
    date,
    createdAt: new Date().toISOString(),
  };
  records.push(record);

  const todayMeals = getTodayMeals(date);
  const calStr = record.estimated_calories
    ? `，约 ${record.estimated_calories} 千卡`
    : "";
  return {
    success: true,
    message: `已记录食物：${record.food_name}（${record.meal_type}）${calStr}`,
    todayMeals,
  };
}

function getRecords(date) {
  if (date) return records.filter((r) => r.date === date);
  return records;
}

module.exports = { definition, execute, getRecords };
