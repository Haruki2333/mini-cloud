/**
 * 冒险游戏技能
 *
 * advance_story — 推进故事的唯一工具
 * 内含文生图能力：当 image_prompt 非空时调用对应厂商的文生图 API
 */

const fetch = require("node-fetch");

// ===== 文生图 API 配置 =====

const IMAGE_PROVIDERS = {
  zhipu: {
    endpoint: "https://open.bigmodel.cn/api/paas/v4/images/generations",
    model: "cogview-4-250304",
    buildBody: (prompt) => ({
      model: "cogview-4-250304",
      prompt,
      size: "1024x576",
    }),
    extractUrl: (data) => data.data && data.data[0] && data.data[0].url,
  },
  qwen: {
    endpoint:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations",
    model: "wanx2.1-t2i-turbo",
    buildBody: (prompt) => ({
      model: "wanx2.1-t2i-turbo",
      prompt,
      size: "1024*576",
    }),
    extractUrl: (data) => data.data && data.data[0] && data.data[0].url,
  },
};

/**
 * 调用文生图 API
 *
 * @param {string} prompt - 英文图片描述
 * @param {string} apiKey - API Key
 * @param {string} provider - 厂商标识（zhipu / qwen）
 * @returns {Promise<string|null>} 图片 URL，失败返回 null
 */
async function generateImage(prompt, apiKey, provider) {
  const config = IMAGE_PROVIDERS[provider];
  if (!config) {
    console.warn("[AdventureSkill] 不支持的文生图厂商:", provider);
    return null;
  }

  try {
    console.log(
      `[AdventureSkill] >>> 文生图请求 (${provider}): ${prompt.substring(0, 80)}...`
    );
    const startTime = Date.now();

    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(config.buildBody(prompt)),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[AdventureSkill] 文生图失败 (${res.status}):`,
        errText.substring(0, 200)
      );
      return null;
    }

    const data = await res.json();
    const url = config.extractUrl(data);
    const duration = Date.now() - startTime;
    console.log(
      `[AdventureSkill] <<< 文生图完成 (${duration}ms): ${url ? "成功" : "无URL"}`
    );
    return url || null;
  } catch (err) {
    console.error("[AdventureSkill] 文生图异常:", err.message);
    return null;
  }
}

// ===== advance_story 工具定义 =====

const advanceStoryDefinition = {
  type: "function",
  function: {
    name: "advance_story",
    description:
      "推进冒险故事。每轮必须调用此工具来展示故事内容和选项。可选设置 image_prompt 在关键场景生成背景图片。",
    parameters: {
      type: "object",
      properties: {
        narrative: {
          type: "string",
          description: "本段故事叙述文本（中文，200-400字）",
        },
        image_prompt: {
          type: "string",
          description:
            "英文场景描述，用于生成背景图片。仅在进入重要新场景、遭遇关键角色或高潮时刻时设置。风格：digital fantasy art, cinematic lighting",
        },
        choices: {
          type: "array",
          description: "供玩家选择的选项（结局时不提供）",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "选项标识（A/B/C/D）",
              },
              text: {
                type: "string",
                description: "选项文字（10-20字）",
              },
            },
            required: ["id", "text"],
          },
        },
        is_ending: {
          type: "boolean",
          description: "是否为故事结局",
        },
        progress: {
          type: "number",
          description: "当前故事进度（1-10）",
        },
        title: {
          type: "string",
          description:
            "故事标题（仅在世界观确定后的第一个场景中设置，用于保存和展示）",
        },
      },
      required: ["narrative", "progress"],
    },
  },
};

/**
 * 创建 advance_story 执行函数（通过闭包绑定 apiKey 和 provider）
 *
 * @param {string} apiKey - 文生图 API Key
 * @param {string} provider - 厂商标识
 * @returns {Function} execute 函数
 */
function createAdvanceStoryExecutor(apiKey, provider) {
  return async function executeAdvanceStory(args) {
    let imageUrl = null;

    if (args.image_prompt && apiKey) {
      imageUrl = await generateImage(args.image_prompt, apiKey, provider);
    }

    return {
      success: true,
      narrative: args.narrative,
      choices: args.choices || [],
      is_ending: args.is_ending || false,
      progress: args.progress || 0,
      title: args.title || null,
      image_url: imageUrl,
    };
  };
}

module.exports = {
  advanceStoryDefinition,
  createAdvanceStoryExecutor,
};
