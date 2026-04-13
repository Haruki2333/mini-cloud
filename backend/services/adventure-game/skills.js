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
    type: "sync",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/images/generations",
    buildBody: (prompt) => ({
      model: "cogview-4-250304",
      prompt,
      size: "1024x576",
    }),
    extractUrl: (data) => data.data && data.data[0] && data.data[0].url,
  },
  qwen: {
    // wanx 模型不支持 compatible-mode 图片端点，需使用 DashScope 原生异步 API
    type: "async",
    submitEndpoint:
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
    taskEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks",
    buildBody: (prompt) => ({
      model: "wanx2.1-t2i-turbo",
      input: { prompt },
      parameters: { size: "1024*576", n: 1 },
    }),
    extractTaskId: (data) => data.output && data.output.task_id,
    extractUrl: (data) =>
      data.output &&
      data.output.results &&
      data.output.results[0] &&
      data.output.results[0].url,
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

  console.log(
    `[AdventureSkill] >>> 文生图请求 (${provider}): ${prompt.substring(0, 80)}...`
  );
  const startTime = Date.now();

  try {
    let url;
    if (config.type === "async") {
      url = await generateImageAsync(prompt, apiKey, config);
    } else {
      url = await generateImageSync(prompt, apiKey, config);
    }
    const duration = Date.now() - startTime;
    console.log(
      `[AdventureSkill] <<< 文生图完成 (${duration}ms): ${url ? "成功" : "无URL"}`
    );
    return url;
  } catch (err) {
    console.error("[AdventureSkill] 文生图异常:", err.message);
    return null;
  }
}

/**
 * 同步文生图（智谱 CogView）
 */
async function generateImageSync(prompt, apiKey, config) {
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
  return config.extractUrl(data) || null;
}

/**
 * 异步文生图（千问 wanx）：提交任务 → 轮询结果
 *
 * DashScope 原生异步 API：
 *   1. POST submitEndpoint（带 X-DashScope-Async: enable）拿到 task_id
 *   2. GET taskEndpoint/{task_id} 轮询，直到 SUCCEEDED 或 FAILED
 */
async function generateImageAsync(prompt, apiKey, config) {
  // 1. 提交任务
  const submitRes = await fetch(config.submitEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(config.buildBody(prompt)),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.error(
      `[AdventureSkill] 文生图提交失败 (${submitRes.status}):`,
      errText.substring(0, 200)
    );
    return null;
  }

  const submitData = await submitRes.json();
  const taskId = config.extractTaskId(submitData);
  if (!taskId) {
    console.error(
      "[AdventureSkill] 文生图未返回 task_id:",
      JSON.stringify(submitData).substring(0, 200)
    );
    return null;
  }

  console.log(`[AdventureSkill] 文生图任务已提交，task_id: ${taskId}`);

  // 2. 轮询任务状态（最多 10 次，每次间隔 3 秒，共约 30 秒）
  const MAX_POLLS = 10;
  const POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const taskRes = await fetch(`${config.taskEndpoint}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!taskRes.ok) {
      console.error(
        `[AdventureSkill] 任务查询失败 (${taskRes.status})，task_id: ${taskId}`
      );
      return null;
    }

    const taskData = await taskRes.json();
    const status = taskData.output && taskData.output.task_status;

    if (status === "SUCCEEDED") {
      return config.extractUrl(taskData) || null;
    }

    if (status === "FAILED") {
      const code = taskData.output && taskData.output.code;
      const msg = taskData.output && taskData.output.message;
      console.error(
        `[AdventureSkill] 文生图任务失败 (${code}): ${msg}`
      );
      return null;
    }

    // PENDING / RUNNING：继续等待
    console.log(
      `[AdventureSkill] 任务状态: ${status}，第 ${i + 1}/${MAX_POLLS} 次轮询`
    );
  }

  console.error(`[AdventureSkill] 文生图任务超时，task_id: ${taskId}`);
  return null;
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
            "英文场景描述，用于生成背景图片。⚠️ 整局游戏仅两处需要填写：(1) 世界观确定后的首个场景（开局），(2) 结局场景（is_ending=true）。其他所有推进轮次必须留空。风格：digital fantasy art, cinematic lighting, detailed environment, 16:9 aspect ratio",
        },
        choices: {
          type: "array",
          description:
            "第一轮世界观选择时必填 3 个作为按钮，每个选项必须同时提供 goal（本局游戏目标）；后续轮次这不是菜单，而是可选的灵感提示（0-2 条），玩家可点击填入输入框作为参考。结局时不提供。",
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
              goal: {
                type: "string",
                description:
                  "仅第一轮世界观选项必填：玩家在本局游戏中需要达成的明确目标（15-40字，中文）。例如：'夺回被恶龙掳走的公主并安全返回王城'。后续轮次的灵感提示不需要此字段。",
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
