import { NextResponse } from 'next/server';
import { Tier, TIER_CONFIG } from '../../lib/types';

interface RecognizeRequest {
  imageBase64: string;
  tier: Tier;
}

const SYSTEM_PROMPT = `你是一个美食识别专家。请分析用户提供的食物照片，以 JSON 格式返回以下信息：
{
  "name": "菜名",
  "ingredients": ["食材1", "食材2", ...],
  "cookingMethod": "烹饪方式",
  "tags": ["标签1", "标签2", ...],
  "description": "一段50字左右的美食描述，生动有趣"
}
标签可以包含菜系（川菜、粤菜等）、口味（辣、清淡等）、类型（家常菜、甜品等）。
只返回合法 JSON，不要包含 markdown 代码块标记或其他内容。`;

async function callZhipu(imageBase64: string, apiKey: string): Promise<string> {
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT },
            {
              type: 'image_url',
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('智谱 API 错误:', res.status, err);
    throw new Error(`智谱 API 调用失败 (${res.status})`);
  }

  const data = await res.json();
  console.log('智谱响应状态:', res.status);
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(imageBase64: string, apiKey: string): Promise<string> {
  // 从 data URL 中提取 mime type 和 base64 数据
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error('无效的图片格式');
  const [, mimeType, base64Data] = match;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: SYSTEM_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('Gemini API 错误:', res.status, err);
    throw new Error(`Gemini API 调用失败 (${res.status})`);
  }

  const data = await res.json();
  console.log('Gemini 响应状态:', res.status);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(imageBase64: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: SYSTEM_PROMPT },
            {
              type: 'image_url',
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('OpenAI API 错误:', res.status, err);
    throw new Error(`OpenAI API 调用失败 (${res.status})`);
  }

  const data = await res.json();
  console.log('OpenAI 响应状态:', res.status);
  return data.choices?.[0]?.message?.content || '';
}

function parseAiResponse(raw: string): Record<string, unknown> {
  // 尝试直接解析
  try {
    return JSON.parse(raw);
  } catch {
    // 尝试从 markdown 代码块中提取
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    throw new Error('无法解析 AI 返回的 JSON');
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RecognizeRequest;
    const { imageBase64, tier } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: '缺少图片数据' }, { status: 400 });
    }

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: '缺少 API Key' }, { status: 401 });
    }

    const config = TIER_CONFIG[tier] || TIER_CONFIG[1];
    console.log(`食物识别请求 - 等级: ${config.label}, 模型: ${config.model}`);

    let rawContent: string;

    switch (config.provider) {
      case 'zhipu':
        rawContent = await callZhipu(imageBase64, apiKey);
        break;
      case 'gemini':
        rawContent = await callGemini(imageBase64, apiKey);
        break;
      case 'openai':
        rawContent = await callOpenAI(imageBase64, apiKey);
        break;
      default:
        return NextResponse.json({ error: '不支持的模型' }, { status: 400 });
    }

    const parsed = parseAiResponse(rawContent);

    return NextResponse.json({
      name: parsed.name || '未知菜品',
      ingredients: parsed.ingredients || [],
      cookingMethod: parsed.cookingMethod || '',
      tags: parsed.tags || [],
      description: parsed.description || '',
      model: config.model,
    });
  } catch (err) {
    console.error('食物识别错误:', err);
    const message = err instanceof Error ? err.message : '识别失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
