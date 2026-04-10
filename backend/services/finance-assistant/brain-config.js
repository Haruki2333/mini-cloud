/**
 * 财务助理 — Brain 配置
 *
 * 包含系统提示词和 Brain 钩子函数：
 * - enhancePrompt: 将用户资料信息注入系统提示词
 * - enhanceToolDefs: 根据用户自定义分类动态修改工具定义
 */

// ===== 系统提示词 =====

const FINANCE_SYSTEM_PROMPT = `你是「光明财务助理」，一个专业、简洁、值得信赖的个人财务 AI 助手。
你的职责是帮助用户记录和分析个人财务数据，包括：收支记录、预算管理、财务分析与建议。

回复要求：
- 简洁明了，数据说话
- 语气专业但友好
- 涉及金额时使用 ¥ 符号
- 如果用户提供了个人资料，适当结合用户信息给出个性化建议
- 使用中文回复

你可以使用以下工具：

1. record 工具 — 记录财务数据，records 数组中每条记录通过 type 区分：
   - type="expense": 当用户提到花钱、消费、买东西、付款等支出时
   - type="income": 当用户提到收入、工资、报销、红包、投资收益等进账时
   - type="budget": 当用户提到预算、限额、每月/每周/每天花费上限时
   如果用户的消息同时涉及多种记录（如"发了工资8000，午饭花了35"），应在一次 record 调用的 records 数组中包含多条记录。

2. query 工具 — 查询和分析财务数据：
   - 当用户想了解自己的收支情况、花费明细、收入统计时使用
   - 支持按日期和类型筛选
   - 返回记录明细和汇总统计（总支出、总收入、净收支、分类统计）
   - 返回月度趋势数据，可用于分析支出变化
   - 返回预算使用情况，可提醒用户预算消耗进度
   - 拿到查询结果后，请用简洁易懂的方式为用户分析总结，善用趋势数据给出洞察

不涉及工具的普通对话（如财务建议、理财知识），直接回复即可，不要强行调用工具。

3. update_profile 工具 — 修改用户的个人资料：
   - 当用户想改名字、昵称时：传入 name 字段
   - 当用户想设置或修改月预算时：传入 monthly_budget 字段（0 表示清除）
   - 当用户想增加/删除/修改支出分类时：基于用户资料中的当前分类列表调整后，将完整的新列表传入 expense_categories 字段

4. update_record 工具 — 修改历史流水记录：
   - 当用户想修改某条记录的金额、分类、描述、日期等时使用
   - 需先调用 query 工具查到目标记录及其 ID，再调用本工具
   - 仅传入需要修改的字段，未传入的字段保持不变

5. delete_record 工具 — 删除历史流水记录：
   - 当用户想删除某条或多条记录时使用
   - 需先调用 query 工具查到目标记录及其 ID，再调用本工具
   - 删除操作不可撤销，执行前应向用户确认（如用户表达明确删除意图则直接执行）
   - 支持一次传入多个 ID 批量删除`;

// ===== Brain 钩子 =====

/**
 * 增强系统提示词：将用户资料信息（称呼、预算、分类）追加到基础提示词中
 *
 * @param {string} basePrompt - 基础系统提示词
 * @param {object} profile - 用户资料（由 dao.getUserProfile 返回）
 * @returns {string} 增强后的提示词
 */
function enhancePrompt(basePrompt, profile) {
  const parts = [basePrompt];
  if (profile) {
    const info = [];
    if (profile.name) info.push("称呼：" + profile.name);
    if (profile.budgets && profile.budgets.length > 0) {
      const lines = profile.budgets
        .map((b) => b.category + "：¥" + b.amount + "/" + b.period)
        .join("、");
      info.push("预算设置：" + lines);
    }
    if (profile.expenseCategories && profile.expenseCategories.length > 0) {
      info.push("支出分类：" + profile.expenseCategories.join("、"));
    }
    if (info.length > 0) {
      parts.push("\n用户资料：\n" + info.join("\n"));
    }
  }
  return parts.join("");
}

/**
 * 增强工具定义：根据用户自定义的支出分类，动态更新 record 工具的 category enum
 *
 * @param {Array} definitions - 原始工具定义数组
 * @param {object} profile - 用户资料
 * @returns {Array} 修改后的工具定义数组
 */
function enhanceToolDefs(definitions, profile) {
  if (!profile || !profile.expenseCategories || profile.expenseCategories.length === 0) {
    return definitions;
  }
  const categories = profile.expenseCategories;
  return definitions.map((def) => {
    if (def.function && def.function.name === "record") {
      const cloned = JSON.parse(JSON.stringify(def));
      const itemProps = cloned.function.parameters.properties.records.items.properties;
      if (itemProps.category) {
        itemProps.category.enum = categories;
        itemProps.category.description =
          "分类（expense/budget 必填），可选值：" + categories.join("、");
      }
      return cloned;
    }
    return def;
  });
}

module.exports = { FINANCE_SYSTEM_PROMPT, enhancePrompt, enhanceToolDefs };
