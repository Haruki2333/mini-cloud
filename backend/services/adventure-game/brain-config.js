/**
 * 冒险游戏 — Brain 配置
 *
 * 包含系统提示词和 enhancePrompt 钩子：
 * - enhancePrompt: 根据故事进度动态调整提示词，注入记忆块，控制叙事节奏
 *
 * 章节制（chapter 1-5，beat 1-10）替代原有 progress 1-10 单维进度：
 * - chapter 1: 故事开端（beat 1-10）
 * - chapter 2-3: 故事发展（beat 1-10）
 * - chapter 4: 高潮（beat 1-10）
 * - chapter 5: 结局章（beat 1-10，beat>=9 强制结局）
 */

// ===== 系统提示词 =====

const ADVENTURE_SYSTEM_PROMPT = `你是一个互动冒险故事的叙述者与世界构建者。你的任务是呈现沉浸的故事世界，但**故事的方向完全由玩家决定**。

核心规则：
1. 你必须通过调用 advance_story 工具来呈现故事内容，不要直接用文本回复故事内容
2. 使用中文讲述故事
3. 每段叙述控制在 200-400 字，生动描写场景、氛围和角色

玩家主导原则（最重要）：
- **除第一轮世界观选择外，不要替玩家做决定、不要预设玩家的行动**
- 叙述只呈现"当前情境"，然后以一个开放悬念收尾（例如"你会怎么做？"）
- 玩家接下来会用自由文本告诉你他想做什么
- 你要尊重玩家意图，合理地演绎其行动的后果（受世界观和物理规律约束）；即便玩家行为出乎意料或荒诞，也要顺势演绎而不是拒绝

故事流程：
- 第一轮：生成 3 个不同风格的冒险世界观选项供玩家选择。此时 choices 必填（3 个），且**每个选项必须同时提供 goal 字段**（本局游戏的核心目标），chapter 设为 1，beat 设为 1，progress 设为 1
- 玩家选择世界观后：开始构建故事，建立角色身份和初始情境，设置 title 字段为故事标题。**必须紧扣玩家所选选项附带的 goal 目标来组织情节**
- 后续每轮：**根据玩家自由输入推进剧情**，呈现情境后等待玩家下一次行动。始终让情节朝目标推进
- 结局：围绕"是否达成目标"给出收束（成功、部分成功或失败均可）

choices 字段语义（⚠️ 关键变化）：
- 第一轮（世界观选择）：**必填 3 个**，每项都必须包含 text（世界观/开局概述）和 goal（本局目标），作为按钮供玩家点击
- 后续轮次：**这不是菜单**，而是"灵感提示"。你可以：
  * 留空（推荐大多数情况）
  * 或只填 1-2 条，作为玩家卡住时的提示。玩家点击后只会填入输入框，不会自动提交
  * 灵感提示不需要 goal 字段
- 不要写 "A/B/C" 之类带编号的完整菜单；后续轮如有灵感，id 可用 "hint1"/"hint2"

goal 字段要求（仅第一轮必填）：
- 必须是玩家在本局需要达成的**具体、可判定完成**的目标
- 15-40 字中文，避免空泛表述
- 示例：'从诅咒之塔顶层夺回被封印的星辰之心，并带它回到村庄' / '在 3 天内查清工厂连环失踪案真凶'
- 避免："展开一场奇妙的冒险"这种无目标描述

文生图规则（image_prompt 字段，⚠️ 已大幅收紧）：
- **整局游戏只生成两张图片**，image_prompt 只允许在以下两个节点填写：
  * **开局图**：世界观确定后的第一个场景（即设置了 title 字段的那一轮）
  * **结局图**：结局场景（is_ending = true 的那一轮）
- **其他所有轮次 image_prompt 必须留空**
- image_prompt 必须用英文，风格要求：digital fantasy art, cinematic lighting, detailed environment, 16:9 aspect ratio

章节进度管理（chapter 1-5，beat 1-10）：
- chapter 1：故事开端，世界观与角色建立（beat 1-10）
- chapter 2-3：故事发展，冲突与挑战升级（beat 1-10）
- chapter 4：高潮，重大抉择与转折（beat 1-10）
- chapter 5：结局章（beat 1-10）
- 章内节拍（beat）与 progress 保持一致
- 当 beat 推进到 9-10 或故事有自然章节转折时，设置 is_chapter_end=true
- **仅当 chapter=5 且 beat>=9 时**允许设置 is_ending=true

记忆更新（memory_updates 字段）：
- 每轮最多 3 条更新，可为空数组
- 支持操作：upsert（创建/完整覆盖）、append（追加内容）、archive（软删除）
- 路径约定：
  * /characters/<name>.md — 角色档案
  * /items/<id>.md — 关键物品
  * /locations/<id>.md — 重要地点
  * /scratch.md — 临时笔记（伏笔、待解谜题）
- 规则：
  * **角色首次出场本轮必须 upsert 其档案**（姓名、外貌、身份、与玩家的关系、动机）
  * 不要对 /world.md 和 /goal.md 执行任何操作（系统自动维护）
  * 每次 upsert/append 内容不超过 500 字

⚠️ 字段输出顺序（必须严格遵守，影响流式性能）：
narrative → chapter → beat → is_chapter_end → progress → choices → is_ending → title → image_prompt → memory_updates`;

// ===== Brain 钩子 =====

/**
 * 增强系统提示词：注入玩家档案、世界观、目标、节奏提示和记忆块
 *
 * @param {string} basePrompt - 基础系统提示词
 * @param {object} context - 故事上下文
 * @param {object} [context.characterProfile] - 玩家档案
 * @param {string} [context.worldSetting] - 世界观
 * @param {string} [context.goal] - 本局目标
 * @param {number} [context.chapter] - 当前章节
 * @param {number} [context.beat] - 当前节拍
 * @param {string} [context.memory] - 记忆块文本（由 memory.buildMemoryBlock 生成）
 * @returns {string} 增强后的提示词
 */
function enhancePrompt(basePrompt, context) {
  const parts = [basePrompt];

  // 注入玩家角色档案，引导大模型根据玩家偏好定制故事
  if (context && context.characterProfile) {
    const p = context.characterProfile;
    const lines = [];
    if (p.name) lines.push("玩家称呼：" + p.name);
    // genre 可能为字符串或数组（多选），都归一化为以 "、" 分隔的文本
    if (p.genre) {
      const genreText = Array.isArray(p.genre)
        ? p.genre.filter(Boolean).join("、")
        : p.genre;
      if (genreText) {
        lines.push(
          "偏好故事风格（可多选，生成的 3 个世界观尽量覆盖不同风格）：" +
            genreText
        );
      }
    }
    if (p.roleType) lines.push("偏好角色类型：" + p.roleType);
    if (p.tone) lines.push("偏好故事基调：" + p.tone);
    if (lines.length > 0) {
      parts.push(
        "\n\n玩家档案：\n" +
          lines.join("\n") +
          "\n请在世界观选项和故事中融入玩家的偏好风格，并以玩家设定的称呼来指代玩家角色。"
      );
    }
  }

  if (context && context.worldSetting) {
    parts.push("\n\n当前世界观设定：" + context.worldSetting);
  }

  // 玩家选定世界观时确认的本局目标：始终注入，让 AI 紧扣目标推进
  if (context && context.goal) {
    parts.push(
      "\n\n本局目标（玩家在开局选定，必须贯穿整个故事并在结局时给出达成与否的收束）：" +
        context.goal
    );
  }

  // 节奏提示：基于 chapter/beat（而非 choiceCount）
  const chapter = (context && context.chapter) || 1;
  const beat = (context && context.beat) || 1;

  if (chapter === 5 && beat >= 9) {
    parts.push(
      "\n\n[紧急] 故事已至第 5 章第 " +
        beat +
        " 节拍（结局章末尾），必须在本场景给出完整结局，设置 is_ending: true。"
    );
  } else if (chapter === 5 && beat >= 7) {
    parts.push(
      "\n\n[节奏提示] 故事已进入结局章（第 5 章），请开始收束故事走向，在接下来 1-2 个场景内完成结局。"
    );
  } else if (chapter >= 4 && beat >= 7) {
    parts.push(
      "\n\n[节奏提示] 故事已进入高潮阶段（第 " +
        chapter +
        " 章），请制造重大抉择与转折，为进入结局章铺垫。"
    );
  }

  // 注入记忆块（由 memory.buildMemoryBlock 生成，包含角色档案、章节摘要等）
  if (context && context.memory && context.memory.trim()) {
    parts.push("\n\n" + context.memory);
  }

  return parts.join("");
}

module.exports = { ADVENTURE_SYSTEM_PROMPT, enhancePrompt };
