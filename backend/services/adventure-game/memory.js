/**
 * 冒险游戏 — 记忆系统
 *
 * 提供分层上下文装配、记忆注入和章节压缩功能：
 * - assembleContext: 从数据库加载并分层裁剪记忆文件和场景摘要
 * - buildMemoryBlock: 生成注入 system prompt 的 <memory> 块
 * - extractAndApply: 从 advance_story 的 memory_updates 字段落库
 * - compactChapter: 章末异步压缩，将章内场景生成摘要存入 /plot/chapter-N.md
 */

const dao = require("./dao");

// ===== 上下文装配 =====

/**
 * 从数据库装配分层记忆上下文
 *
 * 装配规则（按 token 预算分层）：
 * - Pinned 文件（/world.md、/goal.md）：全文注入
 * - 角色/物品/地点：仅"最近 2 章出场"的条目全文；其余仅首行摘要
 * - 章节摘要（/plot/chapter-N.md）：全文
 * - 记忆索引：所有文件路径 + 大小 + 更新轮次
 *
 * @param {string} storyId
 * @param {{ recentK?: number }} options
 * @returns {Promise<{ pinnedFiles: object[], detailFiles: object[], summaryFiles: object[], otherFiles: object[], memoryIndex: object[] }>}
 */
async function assembleContext(storyId, { recentK = 6 } = {}) {
  // 加载所有非删除的记忆文件
  const allFiles = await dao.getMemoryFiles(storyId, { includeDeleted: false });

  if (allFiles.length === 0) {
    return { pinnedFiles: [], detailFiles: [], summaryFiles: [], otherFiles: [], memoryIndex: [] };
  }

  // 获取最近 recentK 场景的最大 seq（用于判断"最近 2 章出场"）
  const recentScenes = await dao.getScenes(storyId, { limit: recentK, desc: true });
  const recentChapters = new Set(recentScenes.map((s) => s.chapter));
  // 至少包含最近 2 章
  const minRecentChapter = recentScenes.length > 0
    ? Math.max(1, Math.min(...Array.from(recentChapters)) - 1)
    : 1;

  // 按类型分组
  const pinnedFiles = allFiles.filter((f) => f.pinned);
  const chapterFiles = allFiles.filter((f) => f.node_type === "chapter");
  const entityFiles = allFiles.filter(
    (f) => ["character", "item", "location"].includes(f.node_type)
  );
  const scratchFiles = allFiles.filter((f) => f.node_type === "scratch");

  // 实体文件：按"是否最近 2 章出场"分为全文 / 摘要两组
  const recentEntityFiles = [];
  const distantEntityFiles = [];
  for (const f of entityFiles) {
    // last_scene_seq 对应的 scene 的 chapter 判断——简化：用 last_scene_seq 估算
    // 最近 recentK 场景中最小 seq
    const minRecentSeq = recentScenes.length > 0
      ? Math.min(...recentScenes.map((s) => s.seq))
      : 0;
    if (f.last_scene_seq >= minRecentSeq) {
      recentEntityFiles.push(f);
    } else {
      distantEntityFiles.push(f);
    }
  }

  // 构建记忆索引（所有文件）
  const memoryIndex = allFiles.map((f) => ({
    path: f.path,
    size: Buffer.byteLength(f.content || "", "utf8"),
    version: f.version,
    last_scene_seq: f.last_scene_seq,
  }));

  return {
    pinnedFiles,
    detailFiles: recentEntityFiles,
    summaryFiles: chapterFiles,
    otherFiles: [...distantEntityFiles, ...scratchFiles],
    memoryIndex,
  };
}

/**
 * 将装配好的上下文渲染为注入 system prompt 的文本块
 *
 * @param {{ pinnedFiles: object[], detailFiles: object[], summaryFiles: object[], otherFiles: object[], memoryIndex: object[] }} assembled
 * @returns {string}
 */
function buildMemoryBlock(assembled) {
  const { pinnedFiles, detailFiles, summaryFiles, otherFiles, memoryIndex } = assembled;

  if (
    pinnedFiles.length === 0 &&
    detailFiles.length === 0 &&
    summaryFiles.length === 0 &&
    otherFiles.length === 0
  ) {
    return "";
  }

  const parts = ["<memory>"];

  // 1. Pinned 核心文件（世界观 + 目标，全文）
  if (pinnedFiles.length > 0) {
    parts.push("## 核心设定");
    for (const f of pinnedFiles) {
      parts.push(`### ${f.path}\n${f.content}`);
    }
  }

  // 2. 近期出场的角色/物品/地点（全文）
  if (detailFiles.length > 0) {
    parts.push("## 近期登场的角色与要素（全文）");
    for (const f of detailFiles) {
      parts.push(`### ${f.path}\n${f.content}`);
    }
  }

  // 3. 章节摘要（全文）
  if (summaryFiles.length > 0) {
    // 按章节排序
    const sorted = [...summaryFiles].sort((a, b) => a.path.localeCompare(b.path));
    parts.push("## 章节摘要");
    for (const f of sorted) {
      parts.push(`### ${f.path}\n${f.content}`);
    }
  }

  // 4. 远期文件（仅首行摘要）+ 临时笔记
  if (otherFiles.length > 0) {
    parts.push("## 其他档案（摘要）");
    for (const f of otherFiles) {
      const firstLine = (f.content || "").split("\n")[0].trim();
      parts.push(`- ${f.path}：${firstLine}`);
    }
  }

  // 5. 记忆索引（供 LLM 知晓可更新的文件树）
  if (memoryIndex.length > 0) {
    parts.push("## 记忆文件索引");
    const indexLines = memoryIndex.map(
      (m) => `- ${m.path}（${m.size}B，v${m.version}，scene#${m.last_scene_seq}）`
    );
    parts.push(indexLines.join("\n"));
  }

  parts.push("</memory>");
  return parts.join("\n\n");
}

// ===== 记忆更新 =====

/**
 * 从 advance_story 工具结果的 memory_updates 字段提取并落库
 *
 * @param {string} storyId
 * @param {Array<{ op: string, path: string, node_type?: string, content?: string }>} memoryUpdates
 * @param {number} sceneSeq
 */
async function extractAndApply(storyId, memoryUpdates, sceneSeq) {
  if (!Array.isArray(memoryUpdates) || memoryUpdates.length === 0) return;

  // 过滤非法路径（不允许修改 /world.md 和 /goal.md）
  const validUpdates = memoryUpdates.filter((upd) => {
    if (!upd || !upd.op || !upd.path) return false;
    if (upd.path === "/world.md" || upd.path === "/goal.md") {
      console.warn("[Memory] 阻止修改 pinned 文件:", upd.path);
      return false;
    }
    return true;
  });

  if (validUpdates.length === 0) return;
  await dao.applyMemoryUpdates(storyId, validUpdates, sceneSeq);
}

// ===== 章节压缩 =====

/**
 * 异步章节压缩：将指定章节的所有场景生成摘要并存入 /plot/chapter-N.md
 *
 * @param {string} storyId
 * @param {number} chapter
 * @param {{ model: string, apiKey: string }} llmConfig
 */
async function compactChapter(storyId, chapter, { model, apiKey }) {
  console.log(`[Memory] 开始章节压缩 story=${storyId} chapter=${chapter}`);

  try {
    // 标记压缩进行中
    await dao.markCompactionPending(storyId, 5);

    // 获取该章节所有场景
    const scenes = await dao.getScenes(storyId, { chapter });
    if (scenes.length === 0) {
      console.warn("[Memory] 章节无场景，跳过压缩:", chapter);
      await dao.clearCompactionPending(storyId);
      return;
    }

    // 获取故事基本信息（用于生成摘要上下文）
    const { getSequelize } = require("../core/db");
    const adventureModels = require("./models");
    const storyRow = await adventureModels.AdventureStory.findOne({
      attributes: ["title", "goal", "world_setting"],
      where: { story_id: storyId },
    });

    // 构建压缩提示词
    const sceneTexts = scenes.map(
      (s, i) =>
        `【场景 ${s.seq}（第${chapter}章·节拍${s.beat}）】\n` +
        (s.player_action ? `玩家行动：${s.player_action}\n` : "") +
        `叙述：${s.narrative}`
    );

    const compactionPrompt = `你是一个故事档案员，请将以下互动故事第 ${chapter} 章的场景整理为一份章节摘要。

${storyRow ? `故事标题：${storyRow.title || "未命名"}\n世界观：${storyRow.world_setting || "未知"}\n目标：${storyRow.goal || "未知"}\n` : ""}

第 ${chapter} 章场景记录（共 ${scenes.length} 个场景）：

${sceneTexts.join("\n\n")}

---

请生成一份简洁的章节摘要（不超过 600 字），内容包含：
1. 本章核心事件（按时间顺序）
2. 玩家的关键决策
3. 引入的重要角色和物品
4. 本章末尾的故事状态

直接输出摘要文本，不要加标题或额外说明。`;

    // 调用 LLM 生成摘要（非流式，直接取 content）
    const { chatStream } = require("../core/llm");
    let summary = "";
    for await (const event of chatStream(
      model,
      [{ role: "user", content: compactionPrompt }],
      apiKey
    )) {
      if (event.type === "done" && event.content) {
        summary = event.content.trim();
      }
    }

    if (!summary) {
      console.warn("[Memory] 章节压缩 LLM 返回空内容");
      await dao.clearCompactionPending(storyId);
      return;
    }

    // 存入虚拟文件树
    await dao.upsertMemoryFile(storyId, {
      path: `/plot/chapter-${chapter}.md`,
      nodeType: "chapter",
      content: `# 第 ${chapter} 章摘要\n\n${summary}`,
      pinned: false,
    });

    await dao.clearCompactionPending(storyId);
    console.log(`[Memory] 章节压缩完成 story=${storyId} chapter=${chapter}，摘要 ${summary.length} 字`);
  } catch (err) {
    console.error("[Memory] 章节压缩失败:", err.message);
    // 不清除 pending 标记，让它自然过期（5 分钟后降级）
  }
}

/**
 * 初始化故事开局记忆文件（世界观和目标）
 * 在玩家选定世界观时调用，创建 pinned 的 /world.md 和 /goal.md
 *
 * @param {string} storyId
 * @param {{ worldSetting: string, goal: string }} data
 */
async function initStoryMemory(storyId, { worldSetting, goal }) {
  if (worldSetting) {
    await dao.upsertMemoryFile(storyId, {
      path: "/world.md",
      nodeType: "world",
      content: `# 世界观\n\n${worldSetting}`,
      pinned: true,
    });
  }
  if (goal) {
    await dao.upsertMemoryFile(storyId, {
      path: "/goal.md",
      nodeType: "goal",
      content: `# 本局目标\n\n${goal}`,
      pinned: true,
    });
  }
}

module.exports = {
  assembleContext,
  buildMemoryBlock,
  extractAndApply,
  compactChapter,
  initStoryMemory,
};
