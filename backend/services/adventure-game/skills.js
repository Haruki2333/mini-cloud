/**
 * 冒险游戏技能
 *
 * advance_story — 推进故事的唯一工具
 *
 * 注意：文生图（generateImage）已从工具执行函数中剥离，
 * 由路由层（adventure.js）在 tool_result 产出后异步触发并通过独立 SSE 事件下发，
 * 以避免阻塞 narrative 返回、改善前端等待体验。
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
      "呈现当前故事情境的唯一工具。每轮必须调用。除第一轮世界观选择外，不要替玩家做决定——叙述应以开放悬念结尾，等待玩家的自由文本行动。",
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
            "英文场景描述，用于生成背景图片。关键节点必须填写：世界观确定后的首个场景、进入全新重要场景、遭遇关键角色/怪物、高潮、结局。普通推进轮次可留空。风格：digital fantasy art, cinematic lighting, detailed environment, 16:9 aspect ratio",
        },
        choices: {
          type: "array",
          description:
            "第一轮世界观选择时必填 3 个作为按钮；后续轮次这不是菜单，而是可选的灵感提示（0-2 条），玩家可点击填入输入框作为参考。结局时不提供。",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "选项标识。世界观轮用 A/B/C；后续灵感提示用 hint1/hint2",
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
 * 创建 advance_story 执行函数
 *
 * 注意：图片生成已从此处剥离，转由路由层异步处理。
 * 本函数仅回传 LLM 解析出的故事结构，并将 image_prompt 透传，
 * 供路由层判断是否需要异步生成背景图。
 *
 * @returns {Function} execute 函数
 */
function createAdvanceStoryExecutor() {
  return async function executeAdvanceStory(args) {
    return {
      success: true,
      narrative: args.narrative,
      choices: args.choices || [],
      is_ending: args.is_ending || false,
      progress: args.progress || 0,
      title: args.title || null,
      image_prompt: args.image_prompt || null,
    };
  };
}

module.exports = {
  advanceStoryDefinition,
  createAdvanceStoryExecutor,
  generateImage,
};
