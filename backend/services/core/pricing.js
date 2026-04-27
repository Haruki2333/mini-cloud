/**
 * LLM 价格表与成本计算
 * 费率来自 lingyaai，单位：CNY/1M tokens。
 */

const PRICING = {
  "claude-sonnet-4-6-thinking":      { input: 10.00, output: 50.00 },
  "gpt-5.4":                         { input:  7.50, output: 45.00 },
  "gemini-3.1-pro-preview-thinking": { input:  9.00, output: 45.00 },
  "deepseek-v4-pro":                 { input: 12.00, output: 24.00 },
  "minimax-m2.5":                    { input:  2.10, output:  8.40 },
  "kimi-k2.6-thinking":              { input:  6.50, output: 27.00 },
};

function calculateCost(modelId, usage) {
  const p = PRICING[modelId];
  if (!p || !usage) return 0;
  const input  = (usage.prompt_tokens     || 0) / 1e6 * p.input;
  const output = (usage.completion_tokens || 0) / 1e6 * p.output;
  return Number((input + output).toFixed(6));
}

module.exports = { PRICING, calculateCost };
