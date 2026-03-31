/**
 * 通用技能注册工厂
 *
 * 根据传入的技能模块列表，生成 definitions 数组（供 LLM 使用）
 * 和 execute 调度函数。
 */

function createSkillRegistry(skillModules) {
  const definitions = Object.values(skillModules).map((s) => s.definition);

  async function execute(name, args) {
    const skill = skillModules[name];
    if (!skill) {
      return { success: false, message: `未知技能: ${name}` };
    }
    return skill.execute(args);
  }

  return { definitions, execute };
}

module.exports = { createSkillRegistry };
