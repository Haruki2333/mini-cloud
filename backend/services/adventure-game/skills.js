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
      "呈现当前故事情境的唯一工具。每轮必须调用。除第一轮背景介绍外，不要替玩家做决定——叙述应以开放悬念结尾，等待玩家的自由文本行动。⚠️ 字段输出顺序必须严格按照：narrative → chapter → beat → is_chapter_end → progress → goal → choices → is_ending → title → image_prompt → memory_updates → stat_delta → awakening_trigger → legacy",
    parameters: {
      type: "object",
      properties: {
        narrative: {
          type: "string",
          description: "本段故事叙述文本（中文，200-400字）。⚠️ 必须是第一个输出的字段",
        },
        chapter: {
          type: "number",
          description: "当前章节号（1-5）。章节1为开端，章节5为结局章",
        },
        beat: {
          type: "number",
          description: "当前章内节拍（1-10）。同时作为 progress 的值",
        },
        is_chapter_end: {
          type: "boolean",
          description: "当前场景是否为本章末尾（触发异步章节摘要生成）",
        },
        progress: {
          type: "number",
          description: "故事进度，与 beat 保持一致（1-10，供前端进度条显示）",
        },
        goal: {
          type: "string",
          description:
            "本局游戏目标（仅第一轮背景介绍时必填）：玩家需要达成的明确目标（15-40字，中文）。例如：'只身深入青龙帮老巢救出被掳走的师妹，并取回武林盟主令'。后续轮次不填。",
        },
        choices: {
          type: "array",
          description:
            "第一轮背景介绍时必须留空。后续轮次这不是菜单，而是可选的灵感提示（0-2 条），玩家可点击填入输入框作为参考。结局时不提供。",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "灵感提示标识，用 hint1/hint2",
              },
              text: {
                type: "string",
                description: "提示文字（10-20字）",
              },
            },
            required: ["id", "text"],
          },
        },
        is_ending: {
          type: "boolean",
          description: "是否为故事结局。仅当 chapter=5 且 beat>=9 时允许设为 true",
        },
        title: {
          type: "string",
          description:
            "故事标题（仅在玩家确认背景后的第一个正式场景中设置，用于保存和展示）",
        },
        image_prompt: {
          type: "string",
          description:
            "英文场景描述，用于生成背景图片。⚠️ 第一轮背景介绍时必须留空。整局游戏仅两处需要填写：(1) 玩家确认背景后的首个正式场景（开局），(2) 结局场景（is_ending=true）。其他所有轮次必须留空。风格：traditional Chinese wuxia art, ink wash painting style, cinematic lighting, detailed environment, 16:9 aspect ratio",
        },
        memory_updates: {
          type: "array",
          description:
            "记忆文件更新操作（每轮最多 3 条）。角色首次出场必须 upsert 其档案。支持的路径：/characters/<name>.md、/items/<id>.md、/locations/<id>.md、/scratch.md",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                description: "操作类型：upsert（创建/覆盖）、append（追加）、archive（软删除）",
              },
              path: {
                type: "string",
                description: "虚拟文件路径，如 /characters/alice.md",
              },
              node_type: {
                type: "string",
                description: "节点类型：character、item、location、scratch",
              },
              content: {
                type: "string",
                description: "文件内容（upsert/append 操作时必填，不超过 500 字）",
              },
            },
            required: ["op", "path"],
          },
        },
        stat_delta: {
          type: "object",
          description:
            "本轮行动触发的属性变化（可选）。仅在玩家行动与某属性强相关时填写，每轮最多 2 项属性变化，绝对值 1-2。含 exp 键（10-30）表示经验增量。skill_unlock 仅在重大突破节点（拜师学艺成功、顿悟绝技）时填写。第一轮背景介绍时必须留空。",
          properties: {
            strength: { type: "number", description: "力量变化（±1-2）" },
            speed: { type: "number", description: "速度变化（±1-2）" },
            neili: { type: "number", description: "内力变化（±1-2）" },
            qinggong: { type: "number", description: "轻功变化（±1-2）" },
            defense: { type: "number", description: "防御变化（±1-2）" },
            wisdom: { type: "number", description: "智谋变化（±1-2）" },
            exp: { type: "number", description: "经验值增量（10-30）" },
            skill_unlock: {
              type: "string",
              description: "本轮解锁的技能名（10字以内），仅关键突破节点填写",
            },
          },
        },
        awakening_trigger: {
          type: "object",
          description:
            "触发前世记忆觉醒场景（可选）。仅在系统提示中有前世遗产注入（previousLegacy）时可用。选择第2章中段（beat 4-7）最自然的叙事节点填写一次，整局只触发一次。觉醒内容要自然融入当前叙述结尾，不割裂节奏。",
          properties: {
            fragments_shown: {
              type: "array",
              description: "本次浮现的前世记忆碎片（1-2条，从注入的遗产中选取最相关的）",
              items: { type: "string" },
            },
            stat_bonus: {
              type: "object",
              description: "觉醒瞬间立即生效的属性加成（可选，每项 +1-2，代表前世技能的觉醒）",
              properties: {
                strength: { type: "number" },
                speed: { type: "number" },
                neili: { type: "number" },
                qinggong: { type: "number" },
                defense: { type: "number" },
                wisdom: { type: "number" },
              },
            },
          },
          required: ["fragments_shown"],
        },
        legacy: {
          type: "object",
          description:
            "本世遗产总结（仅在 is_ending=true 时填写，其他时候必须留空）。提炼本世最有意义的 3-5 件事，供下一世觉醒时注入。",
          properties: {
            lifespan: {
              type: "string",
              description: "本世归宿（20字以内，如「英年早逝，死于与血刀门的最后一战」）",
            },
            peak_stats: {
              type: "object",
              description: "本世属性峰值（与 context 中注入的当前属性值保持一致）",
              properties: {
                strength: { type: "number" },
                speed: { type: "number" },
                neili: { type: "number" },
                qinggong: { type: "number" },
                defense: { type: "number" },
                wisdom: { type: "number" },
              },
            },
            fragments: {
              type: "array",
              description: "前世记忆碎片（3-5条）",
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["skill", "bond", "enemy", "memory"],
                    description: "碎片类型：skill=武技、bond=情感羁绊、enemy=宿敌、memory=特殊记忆",
                  },
                  content: {
                    type: "string",
                    description: "碎片描述（30字以内）",
                  },
                },
                required: ["type", "content"],
              },
            },
          },
          required: ["lifespan", "fragments"],
        },
      },
      required: ["narrative", "chapter", "beat"],
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
      chapter: args.chapter || 1,
      beat: args.beat || 1,
      is_chapter_end: args.is_chapter_end || false,
      goal: args.goal || null,
      choices: args.choices || [],
      is_ending: args.is_ending || false,
      progress: args.progress || args.beat || 0,
      title: args.title || null,
      image_prompt: args.image_prompt || null,
      memory_updates: args.memory_updates || [],
      stat_delta: args.stat_delta || null,
      awakening_trigger: args.awakening_trigger || null,
      legacy: args.legacy || null,
    };
  };
}

// ===== narrative 流式提取状态机 =====

/**
 * 从 advance_story 工具的流式参数 JSON 中实时提取 narrative 字段值。
 *
 * 参数 JSON 形如：{"narrative":"故事文本...","chapter":2,...}
 * 状态机在流中定位 "narrative":" 起始标记，随后逐字提取文本内容，
 * 遇到未转义的 " 时结束提取。完整处理 JSON 字符串转义序列。
 *
 * @returns {function(chunk: string): string} feed 函数，返回本次提取到的字符
 */
function createNarrativeExtractor() {
  const TARGET = '"narrative":"';
  let state = "scanning"; // 'scanning' | 'in_value' | 'done'
  let pending = "";

  return function feed(chunk) {
    if (state === "done") return "";
    pending += chunk;
    let extracted = "";

    if (state === "scanning") {
      const idx = pending.indexOf(TARGET);
      if (idx >= 0) {
        state = "in_value";
        pending = pending.slice(idx + TARGET.length);
      } else {
        // 保留尾部防止跨 chunk 时匹配失败
        if (pending.length > TARGET.length - 1) {
          pending = pending.slice(-(TARGET.length - 1));
        }
        return "";
      }
    }

    if (state === "in_value") {
      let i = 0;
      while (i < pending.length) {
        const ch = pending[i];
        if (ch === "\\") {
          if (i + 1 < pending.length) {
            const next = pending[i + 1];
            if (next === "n") extracted += "\n";
            else if (next === "t") extracted += "\t";
            else if (next === '"') extracted += '"';
            else if (next === "\\") extracted += "\\";
            else extracted += ch + next;
            i += 2;
          } else {
            pending = pending.slice(i);
            return extracted;
          }
        } else if (ch === '"') {
          state = "done";
          pending = "";
          break;
        } else {
          extracted += ch;
          i++;
        }
      }
      if (state === "in_value") {
        pending = "";
      }
    }

    return extracted;
  };
}

module.exports = {
  advanceStoryDefinition,
  createAdvanceStoryExecutor,
  createNarrativeExtractor,
  generateImage,
};
