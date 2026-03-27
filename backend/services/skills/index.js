/**
 * 技能注册与路由
 */

const expense = require("./expense");
const foodLog = require("./food-log");
const todo = require("./todo");
const insight = require("./insight");

const skillModules = {
  record_expense: expense,
  record_food: foodLog,
  record_todo: todo,
  record_insight: insight,
};

/** 所有技能的 tool definition 数组（传给 LLM） */
const definitions = Object.values(skillModules).map((s) => s.definition);

/**
 * 根据技能名称执行对应技能
 * @param {string} name - 技能名称（如 "record_expense"）
 * @param {object} args - 参数对象
 * @returns {Promise<object>} 执行结果
 */
async function execute(name, args) {
  const skill = skillModules[name];
  if (!skill) {
    return { success: false, message: `未知技能: ${name}` };
  }
  return skill.execute(args);
}

module.exports = { definitions, execute };
