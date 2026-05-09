---
description: 扫描 docs/tasks/backlog.md 并推进所有任务（出方案 / 调整 / 实现 / 状态回收）
---

你正在执行**任务自动化工作流**的周期性扫描。本命令应当是幂等的——多次运行不会重复处理同一个任务，也不会误操作无关代码。

## 配额（硬上限）

每轮扫描各类操作的最大处理数量：

```
QUOTA_WIP_TO_DONE      = 不限     # 仅查 PR 状态，便宜
QUOTA_FEEDBACK_REPLAN  = 3       # 重写方案，中等开销
QUOTA_IDEA_TO_PLAN     = 3       # 首次出方案，中等开销
QUOTA_OK_TO_WIP        = 1       # 实现并开 PR，最耗 token
```

超出配额的任务**不报错**，在结束日志里列入"本轮被推迟"清单，下轮继续。

## 执行步骤

### 第 1 步：同步 master

```bash
git checkout master
git pull origin master
```

如果出现合并冲突或 detached HEAD 等异常状态，**立即停止扫描**并把异常情况输出到终端，不要尝试自动修复。

### 第 2 步：解析 backlog

读取 `docs/tasks/backlog.md`。每个任务是一个二级标题块，形如：

```markdown
## T001 任务标题
- 状态: <state>
- 创建: YYYY-MM-DD
- 方案: <plan-link>

<任务正文>
```

提取每个任务的：ID、标题、状态、创建日期、方案链接、正文。

**状态规范化**：
- `approved` / `approve` / `通过` → `ok`
- `rejected` / `cancel` / `跳过` → `skip`
- `in-progress` / `in_progress` → `wip`
- 其他不识别的值 → 输出警告，跳过该任务

**ID 分配**：扫描所有形如 `T???` / `T新` / `T_` 等占位符的任务，按出现顺序分配 `T<max+1>`、`T<max+2>` ... 替换占位符。如果 backlog 中本来就没有任务，从 `T001` 开始。

### 第 3 步：分派处理（按"先便宜后昂贵"顺序）

#### 3.1 处理 `wip` → `done`（不限数量）

对每个 `状态: wip` 的任务：
- 从该任务的 plan 文件或 backlog 条目中找到记录的 PR 编号
- 用 `mcp__github__pull_request_read` 查询 PR 状态
- 如果 PR 已 merged：把 backlog 中该任务状态改为 `done`
- 如果 PR 仍 open / closed-未合并：跳过
- 如果查询失败：跳过，记录到错误日志

所有 wip 任务处理完后，如果 backlog 有变更，**一次性 commit**：
```
docs(tasks): 回收已完成任务状态
```

#### 3.2 处理 `planned` 的 Feedback（最多 QUOTA_FEEDBACK_REPLAN 个）

按创建日期升序遍历所有 `状态: planned` 的任务，达到配额即停止：

- 读取 `docs/tasks/plans/<id>.md`
- 检查 `## Feedback` 区是否有非空白内容（忽略 HTML 注释和提示文字）
- 如果为空 → 跳过
- 如果有反馈：
  1. 调用 Plan 子 agent，把"原方案 + 用户反馈 + 任务正文"作为输入，让它重写整份方案
  2. 覆盖 `plans/<id>.md`，**清空** Feedback 区（保留区块标题和占位提示）
  3. 单独 commit：`docs(tasks): T<id> 根据反馈调整方案`

#### 3.3 处理 `idea` → `planned`（最多 QUOTA_IDEA_TO_PLAN 个）

按创建日期升序遍历所有 `状态: idea` 的任务，达到配额即停止：

1. 调用 Explore 子 agent 搜集相关代码上下文（限定为 medium 广度）
2. 调用 Plan 子 agent 生成实现方案
3. 写入 `docs/tasks/plans/<id>.md`，模板见下方
4. 在 backlog 中把状态改为 `planned`，方案字段填 `[plan](plans/<id>.md)`
5. 单独 commit：`docs(tasks): T<id> 出实现方案`

**plan 文件模板**：

```markdown
# T<id> <标题>

## Context
（为什么做、当前痛点、相关背景）

## 实现方案
（具体怎么改，分步骤，引用具体文件路径和行号）

## 涉及文件
- `path/to/file.js:行号`

## 验证方式
（如何端到端跑通、跑哪个评估批次或测试）

## Feedback
<!-- 留空 = 没有新反馈。
     在这里写任何反馈，下次扫描时 AI 会基于反馈重写整个方案，并清空本区。 -->
```

#### 3.4 处理 `ok` → `wip`（最多 QUOTA_OK_TO_WIP = 1 个）

按创建日期升序，**只取第 1 个** `状态: ok` 的任务：

1. 创建分支：`git checkout -b claude/task-<id>-<slug>`（slug 从标题转 kebab-case 取前 4 词）
2. 严格按 plan 文件实施改动
3. 在分支上 commit（多次 commit 可，遵循项目中文 commit 风格）
4. `git push -u origin claude/task-<id>-<slug>`，遇到网络错误最多重试 4 次（2/4/8/16 秒退避）
5. 用 `mcp__github__create_pull_request` 开 PR：
   - 标题：`<任务标题>`
   - body 链接 `docs/tasks/plans/<id>.md`，并附简短摘要
6. 切回 master：`git checkout master`
7. 在 backlog 中把状态改为 `wip`，并把 PR 编号记录到该任务的"方案"字段后面：`[plan](plans/<id>.md) | PR #<num>`
8. commit 并 push master：`docs(tasks): T<id> 进入实现阶段（PR #<num>）`

**重要**：不要主动 merge PR，由用户人工合并。

### 第 4 步：错误兜底

任何任务处理失败（解析异常、子 agent 报错、网络重试 4 次仍失败）：
- 把异常摘要追加到该任务 plan 文件的 `## ⚠️ 上次扫描错误` 区（若文件不存在则跳过此步）
- **不**改任务状态
- 继续处理下一个任务，不要让单点失败拖垮整轮扫描

### 第 5 步：结束日志

扫描结束在终端输出一份摘要：

```
[scan-backlog] 本轮处理完成：
  - wip → done：处理 X 个，跳过 Y 个
  - feedback 调整：处理 X 个，被推迟 Z 个
  - idea → planned：处理 X 个，被推迟 Z 个
  - ok → wip：处理 X 个，被推迟 Z 个
  - 错误：N 个（详见各 plan 文件 ⚠️ 区）
```

## 关键约束

- **idea / feedback / wip→done 阶段只允许动 `docs/tasks/` 下的文件**，禁止修改业务代码
- **ok → wip 的实现阶段必须开新分支**，禁止直接在 master 上改业务代码
- 单任务超时上限：方案生成 ≤ 5 min，实现 ≤ 20 min，超时则恢复状态并记录错误
- 永远不要 force-push、不要 amend 已有 commit、不要绕过 hook
- 不要主动合并 PR

## 触发

人工：直接 `/scan-backlog`
自动：Claude Code on the web 定时任务（建议 1 小时一次）
