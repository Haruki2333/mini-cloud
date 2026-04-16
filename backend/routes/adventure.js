/**
 * 对话路由 — 冒险游戏
 *
 * 架构说明：
 * - 长篇记忆：通过 MySQL 三张表（adventure_stories/memory_files/scenes）持久化
 * - 请求入参：新增 story_id（缺省 = 开新档）；前端只传最近 K 条消息
 * - 上下文装配：每轮从 DB 加载记忆文件 + 章节摘要，注入 system prompt
 * - 场景落库：tool_result 后异步执行 appendScene + applyMemoryUpdates + updateStoryProgress
 * - 章节压缩：is_chapter_end=true 时 fire-and-forget 触发独立 LLM 调用生成章节摘要
 * - 并发控制：story 级别乐观锁（lock_token + lock_expires_at）
 *
 * 新增只读端点：
 * - GET /api/adventure/stories — 列出用户故事
 * - GET /api/adventure/stories/:id — 获取单个故事（含近期场景，用于恢复游戏）
 *
 * 导出 adventureRouter（挂载到 /api/adventure）。
 */

const express = require("express");
const { getModelInfo } = require("../services/core/llm");
const { createBrain } = require("../services/core/brain");
const {
  ADVENTURE_SYSTEM_PROMPT,
  enhancePrompt,
} = require("../services/adventure-game/brain-config");
const {
  advanceStoryDefinition,
  createAdvanceStoryExecutor,
  generateImage,
} = require("../services/adventure-game/skills");
const dao = require("../services/adventure-game/dao");
const memory = require("../services/adventure-game/memory");

// ===== Narrative 流式提取状态机 =====

/**
 * 从 advance_story 工具的流式参数 JSON 中实时提取 narrative 字段值。
 *
 * 参数 JSON 形如：{"narrative":"故事文本...","chapter":2,...}
 * 状态机在流中定位 "narrative":" 起始标记，随后逐字提取文本内容，
 * 遇到未转义的 " 时结束提取。完整处理 JSON 字符串转义序列。
 *
 * @returns {function(chunk: string): string}  feed 函数，返回本次提取到的字符
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
        // 保留尾部（TARGET.length-1 个字符）防止跨 chunk 时匹配失败
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
            // 转义字符跨 chunk，等待下一片
            pending = pending.slice(i);
            return extracted;
          }
        } else if (ch === '"') {
          // narrative 字段结束
          state = "done";
          pending = "";
          break;
        } else {
          extracted += ch;
          i++;
        }
      }
      if (state === "in_value") {
        pending = ""; // 本批已全部提取
      }
    }

    return extracted;
  };
}

// ===== 用户标识提取 =====

function extractUserToken(req) {
  return req.headers["x-wx-openid"] || req.headers["x-anon-token"] || null;
}

// ===== SSE 对话处理 =====

async function handleCompletions(req, res) {
  let storyId = null;
  let lockToken = null;

  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "缺少 API Key，请在设置中配置" });
    }

    const userToken = extractUserToken(req);
    if (!userToken) {
      return res.status(401).json({ error: "缺少用户标识（X-Anon-Token 或 x-wx-openid）" });
    }

    const { messages, context, story_id: reqStoryId } = req.body;
    let model = req.body.model || "qwen3.5-plus";

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "消息列表不能为空" });
    }

    const modelInfo = getModelInfo(model);
    if (!modelInfo) {
      return res.status(400).json({ error: "不支持的模型: " + model });
    }

    // ===== 1. 加载或创建故事 =====

    let story;
    let isNewStory = false;

    if (reqStoryId) {
      story = await dao.loadStory(reqStoryId, userToken);
      if (!story) {
        return res.status(404).json({ error: "故事不存在或无权访问" });
      }
    } else {
      const newId = await dao.createStory({
        userToken,
        characterProfile: context && context.characterProfile,
      });
      story = await dao.loadStory(newId, userToken);
      isNewStory = true;
    }
    storyId = story.story_id;

    // ===== 2. 并发锁 =====

    lockToken = dao.generateUUID();
    const locked = await dao.acquireLock(storyId, lockToken);
    if (!locked) {
      return res.status(409).json({ error: "游戏请求进行中，请稍等" });
    }

    // ===== 3. 装配记忆上下文 =====

    const assembled = await memory.assembleContext(storyId, { recentK: 6 });
    const memoryBlock = memory.buildMemoryBlock(assembled);

    // ===== 4. 构建增强上下文 =====

    const enhancedContext = {
      ...(context || {}),
      // 服务端状态优先（过 DB），其次用客户端传入
      worldSetting: story.world_setting || (context && context.worldSetting),
      goal: story.goal || (context && context.goal),
      chapter: story.current_chapter || 1,
      beat: story.current_beat || 1,
      characterProfile:
        story.character_profile || (context && context.characterProfile),
      memory: memoryBlock,
    };

    // ===== 5. Per-request 实例 =====

    const imageApiKey = req.headers["x-image-api-key"] || apiKey;
    const provider = modelInfo.provider;
    const executeAdvanceStory = createAdvanceStoryExecutor();

    const skills = {
      definitions: [advanceStoryDefinition],
      execute: async function (name, args) {
        if (name === "advance_story") {
          return executeAdvanceStory(args);
        }
        return { success: false, message: "未知技能: " + name };
      },
    };

    const brain = createBrain({
      systemPrompt: ADVENTURE_SYSTEM_PROMPT,
      skills,
      enhancePrompt,
    });

    // ===== 6. SSE 流式响应 =====

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let clientClosed = false;
    req.on("close", () => {
      clientClosed = true;
    });
    function writeEvent(payload) {
      if (clientClosed) return;
      try {
        res.write("data: " + JSON.stringify(payload) + "\n\n");
      } catch (e) {
        clientClosed = true;
      }
    }

    // 新建故事时先通知前端 story_id
    if (isNewStory) {
      writeEvent({ type: "story_created", story_id: storyId });
    }

    // ===== 7. Brain 推理循环 =====

    let turnCounter = 0;
    const pendingImages = [];
    const pendingDbOps = [];
    const feedNarrative = createNarrativeExtractor();

    // 累积本次请求所有 LLM 调用的 token 用量
    const collectedUsage = { input_tokens: 0, output_tokens: 0, cached_tokens: null };
    // 提升 sceneSeqPromise 到外层，供循环结束后的用量落库引用
    let sceneSeqPromise = null;

    // 提取最后一条用户消息作为 player_action
    const userMessages = messages.filter((m) => m.role === "user");
    const playerAction =
      userMessages.length > 0
        ? userMessages[userMessages.length - 1].content
        : null;

    for await (const event of brain.think({
      messages,
      model,
      apiKey,
      context: enhancedContext,
    })) {
      // llm_usage：累积 token 用量，不转发给前端
      if (event.type === "llm_usage") {
        const u = event.usage || {};
        collectedUsage.input_tokens += u.prompt_tokens || 0;
        collectedUsage.output_tokens += u.completion_tokens || 0;
        const cached =
          u.prompt_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? null;
        if (cached != null) {
          collectedUsage.cached_tokens = (collectedUsage.cached_tokens || 0) + cached;
        }
        continue;
      }

      // args_delta：流式提取 narrative 文本，不转发原始事件
      if (event.type === "args_delta") {
        if (event.name === "advance_story") {
          const narChunk = feedNarrative(event.chunk);
          if (narChunk) {
            writeEvent({ type: "narrative_delta", content: narChunk });
          }
        }
        continue;
      }

      // tool_result：特殊处理（DB 落库 + 图片生成）
      if (event.type === "tool_result" && event.name === "advance_story") {
        writeEvent(event);

        const result = event.result;

        // 图片生成策略：仅开局（设了 title）和结局（is_ending=true）生成图片
        const shouldGenerateImage =
          result &&
          result.image_prompt &&
          imageApiKey &&
          (result.title || result.is_ending);

        // 场景序号 Promise（appendScene 返回 seq，供图片更新及 token 用量落库使用）
        sceneSeqPromise = dao
          .appendScene(storyId, {
            chapter: result.chapter || story.current_chapter,
            beat: result.beat || story.current_beat,
            playerAction,
            narrative: result.narrative,
            choices: result.choices || [],
            imagePrompt: result.image_prompt || null,
            isEnding: result.is_ending || false,
          })
          .catch((err) => {
            console.error("[Adventure] appendScene 失败:", err.message);
            return null;
          });

        // DB 任务：场景落库 + 进度更新 + 记忆更新 + story_saved 事件
        const dbTask = (async () => {
          const seq = await sceneSeqPromise;
          if (seq == null) return null;

          // 更新故事进度、标题、世界观（若初次设定）
          const progressUpdate = {
            chapter: result.chapter || story.current_chapter,
            beat: result.beat || story.current_beat,
          };
          if (result.title && !story.title) progressUpdate.title = result.title;
          if (result.is_ending) progressUpdate.status = "ended";

          // 若本轮是世界观选定轮（有 title）且故事无世界观，更新世界观和目标
          // worldSetting 来自 context，此处从 enhancedContext 取
          if (result.title && !story.world_setting && enhancedContext.worldSetting) {
            progressUpdate.worldSetting = enhancedContext.worldSetting;
          }

          await dao.updateStoryProgress(storyId, progressUpdate).catch((err) => {
            console.error("[Adventure] updateStoryProgress 失败:", err.message);
          });

          writeEvent({ type: "story_saved", story_id: storyId, scene_seq: seq });

          // 应用记忆更新
          const memUpdates = result.memory_updates;
          if (Array.isArray(memUpdates) && memUpdates.length > 0) {
            try {
              await memory.extractAndApply(storyId, memUpdates, seq);
              writeEvent({ type: "memory_updated", count: memUpdates.length });
            } catch (memErr) {
              console.error("[Adventure] 记忆更新失败:", memErr.message);
            }
          }

          // 世界观首次选定时初始化 pinned 记忆文件（/world.md 和 /goal.md）
          if (result.title && !story.world_setting) {
            memory
              .initStoryMemory(storyId, {
                worldSetting: enhancedContext.worldSetting,
                goal: enhancedContext.goal,
              })
              .catch((err) => {
                console.error("[Adventure] initStoryMemory 失败:", err.message);
              });
          }

          return seq;
        })();
        pendingDbOps.push(dbTask);

        // 章末异步压缩
        if (result.is_chapter_end) {
          const chapterNum = result.chapter || story.current_chapter;
          memory
            .compactChapter(storyId, chapterNum, { model, apiKey })
            .then(() => {
              writeEvent({ type: "chapter_compacted", chapter: chapterNum });
            })
            .catch((err) => {
              console.error("[Adventure] 章节压缩失败:", err.message);
            });
        }

        // 图片生成（fire-and-forget，与 DB 并行）
        if (shouldGenerateImage) {
          const turnId = ++turnCounter;
          writeEvent({ type: "scene_image_pending", turn_id: turnId });

          const imageTask = (async () => {
            const url = await generateImage(
              result.image_prompt,
              imageApiKey,
              provider
            );
            if (url) {
              writeEvent({ type: "scene_image", turn_id: turnId, url });
              // 图片 URL 落库（等 seq 就绪后）
              dbTask
                .then((seq) => {
                  if (seq != null) {
                    dao.updateSceneImageUrl(storyId, seq, url).catch(() => {});
                  }
                })
                .catch(() => {});
            } else {
              writeEvent({
                type: "scene_image_error",
                turn_id: turnId,
                message: "图像生成失败",
              });
            }
          })();
          pendingImages.push(imageTask);
        }

        continue; // writeEvent 已在上面调用
      }

      // 其余事件直接转发
      writeEvent(event);
    }

    // ===== 8. Token 用量落库（等 sceneSeqPromise 就绪后写入） =====

    if (collectedUsage.input_tokens > 0 && sceneSeqPromise) {
      pendingDbOps.push(
        sceneSeqPromise
          .then((seq) =>
            dao.recordTokenUsage(storyId, {
              sceneSeq: seq,
              usageType: "chat",
              model,
              inputTokens: collectedUsage.input_tokens,
              outputTokens: collectedUsage.output_tokens,
              cachedTokens: collectedUsage.cached_tokens,
            })
          )
          .catch((err) => {
            console.error("[Adventure] 记录 token 用量失败:", err.message);
          })
      );
    }

    // ===== 9. 等待所有异步任务 =====

    await Promise.allSettled(pendingDbOps);
    await Promise.allSettled(pendingImages);

    // 释放锁
    await dao.releaseLock(storyId, lockToken).catch(() => {});
    lockToken = null;

    if (!clientClosed) {
      try {
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (_) {}
    }
  } catch (err) {
    console.error("[Adventure] 调用失败:", err.message);

    // 确保释放锁
    if (storyId && lockToken) {
      await dao.releaseLock(storyId, lockToken).catch(() => {});
    }

    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      try {
        res.write(
          "data: " +
            JSON.stringify({ type: "error", message: err.message }) +
            "\n\n"
        );
        res.end();
      } catch (_) {}
    }
  }
}

// ===== 只读端点 =====

/**
 * GET /api/adventure/stories — 列出用户存档
 */
async function handleListStories(req, res) {
  try {
    const userToken = extractUserToken(req);
    if (!userToken) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;

    const stories = await dao.listStories(userToken, { limit, offset });
    res.json({ stories });
  } catch (err) {
    console.error("[Adventure] listStories 失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/adventure/stories/:id — 获取单个故事（含近期场景，用于恢复游戏）
 */
async function handleGetStory(req, res) {
  try {
    const userToken = extractUserToken(req);
    if (!userToken) {
      return res.status(401).json({ error: "缺少用户标识" });
    }

    const story = await dao.loadStory(req.params.id, userToken);
    if (!story) {
      return res.status(404).json({ error: "故事不存在" });
    }

    // 返回最近 12 个场景（用于前端重建对话历史）
    const recentScenes = await dao.getScenes(story.story_id, {
      limit: 12,
      desc: true,
    });
    // 按 seq 正序返回
    recentScenes.sort((a, b) => a.seq - b.seq);

    res.json({ story, recentScenes });
  } catch (err) {
    console.error("[Adventure] getStory 失败:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ===== 路由 =====

const adventureRouter = express.Router();
adventureRouter.post("/completions", handleCompletions);
adventureRouter.get("/stories", handleListStories);
adventureRouter.get("/stories/:id", handleGetStory);

module.exports = { adventureRouter };
