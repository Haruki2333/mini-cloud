export type Tier = 1 | 2 | 3;

export interface FoodRecord {
  id: string;
  imageBase64: string;
  name: string;
  ingredients: string[];
  cookingMethod: string;
  tags: string[];
  aiDescription: string;
  tier: Tier;
  createdAt: string;
}

export interface UserSettings {
  tier: Tier;
  apiKeys: {
    zhipu?: string;
    gemini?: string;
    openai?: string;
  };
}

export interface RecognizeResult {
  name: string;
  ingredients: string[];
  cookingMethod: string;
  tags: string[];
  description: string;
  model: string;
}

export const TIER_CONFIG: Record<Tier, { label: string; model: string; provider: string }> = {
  1: { label: '体验版', model: 'glm-4v-flash', provider: 'zhipu' },
  2: { label: '标准版', model: 'gemini-2.0-flash', provider: 'gemini' },
  3: { label: '高级版', model: 'gpt-4o', provider: 'openai' },
};
