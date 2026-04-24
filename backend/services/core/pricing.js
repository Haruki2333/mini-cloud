/**
 * LLM 价格表与成本计算
 * 费率以各厂商官方价（USD/1M tokens）为占位，实际费率请对照 lingyaai 账单校准。
 */

const PRICING = {
  "claude-sonnet-4-5": { input: 3.00,  output: 15.00 },
  "gpt-4o":            { input: 2.50,  output: 10.00 },
  "gemini-2.5-pro":    { input: 1.25,  output: 10.00 },
  "deepseek-chat":     { input: 0.27,  output:  1.10 },
  "glm-4.6v":          { input: 0.29,  output:  1.14 },
  "qwen3.5-plus":      { input: 0.56,  output:  1.68 },
};

function calculateCost(modelId, usage) {
  const p = PRICING[modelId];
  if (!p || !usage) return 0;
  const input  = (usage.prompt_tokens     || 0) / 1e6 * p.input;
  const output = (usage.completion_tokens || 0) / 1e6 * p.output;
  return Number((input + output).toFixed(6));
}

module.exports = { PRICING, calculateCost };
