# 任务自动化工作流

本目录承载 AI 自动完成任务的工作流：用户在 [`backlog.md`](backlog.md) 里记录想法，
Claude Code 周期性扫描，自动出方案 / 实现 / 开 PR，用户只需"审核"即可。

## 目录结构

```
docs/tasks/
├── README.md          # 本文件
├── backlog.md         # 任务清单（用户录入想法 + AI 维护状态）
└── plans/
    └── T<NNN>.md      # 每个任务一份独立方案文件
```

## 状态机

| 状态值 | 含义 | 谁来设置 |
|--------|------|----------|
| `idea` | 用户新记的想法，还没方案 | 用户 |
| `planned` | AI 已生成方案，等用户审核 | 扫描循环 |
| `ok` | 用户审核通过，待实现 | **用户手改** |
| `wip` | AI 已开分支并发 PR，等待合并 | 扫描循环 |
| `done` | PR 已 merge | 扫描循环 |
| `skip` | 用户放弃此任务 | 用户手改 |

兼容写法：`approved` / `approve` / `通过` 视作 `ok`；`rejected` / `cancel` / `跳过` 视作 `skip`。
下次扫描会规范化回标准词。

## 用户操作清单

### 1. 加一个新任务

在 `backlog.md` 文末追加一个块：

```markdown
## T??? 一句话标题
- 状态: idea
- 创建: 2026-05-09
- 方案: -

任务的详细描述写在这里。可以是想法、痛点、参考资料链接等等。
AI 会以这段文字作为出方案的输入。
```

`T???` 占位符会被扫描器替换为下一个序号。

### 2. 审核 AI 出的方案

扫描完成后，任务状态会变为 `planned`，方案字段会指向 `plans/T<NNN>.md`。

打开方案文件，浏览 Context / 实现方案 / 涉及文件 / 验证方式 四个章节：

- **同意** → 把 `backlog.md` 中该任务的 `状态: planned` 改成 `状态: ok`，保存。
- **不同意** → 在方案文件末尾的 `## Feedback` 区写一行反馈（具体到"换某种实现"或
  "考虑某个边界"），不动状态字段。下次扫描 AI 会基于反馈重写整份方案。
- **不想做** → 把 `状态: planned` 改成 `状态: skip`。

### 3. 等待实现

状态变为 `ok` 后，下次扫描 AI 会：
- 创建分支 `claude/task-T<NNN>-<slug>`
- 在分支上实现方案、commit、push、开 PR
- 把 `backlog.md` 中状态改为 `wip`，并记录 PR 编号

### 4. 合并 PR

PR 由你 review 后 squash merge。merge 之后下次扫描会把状态自动收回为 `done`。

## 扫描器

入口：`.claude/commands/scan-backlog.md`，通过 `/scan-backlog` 触发。

触发方式：Claude Code on the web 定时任务，建议每小时一次。也可以本地手动跑。

每轮扫描的配额（详见命令文件顶部常量）：
- `wip → done` 状态回收：不限
- `planned` Feedback 调整：每轮最多 3 个
- `idea → planned` 出方案：每轮最多 3 个
- `ok → wip` 实现并开 PR：**每轮最多 1 个**（最耗 token，避免单 session 超限）

超出配额的任务会列在结束日志的"本轮被推迟"清单里，下轮继续。
