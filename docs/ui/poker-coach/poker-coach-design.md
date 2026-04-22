# 设计规范：Coach's Notebook（教练笔记本风格）

我希望你在实现 UI 时，遵循以下"手写教练笔记本"的美学与交互语言。这不是一个通用的后台风格，它需要稳定的克制与一致的质感。

## 1. 设计哲学
- 界面像一本**真实被写过的皮面笔记本**：纸张暖色、墨水、铅笔批注、红笔重点、荧光笔高亮。
- 核心信息由**手写字体**承载（情绪、点评、分数），数据与元信息用**等宽字体**（编号、金额、频率），正文用**衬线字体**（可读性主体）。
- 每个卡片/模块都应该有"被手翻过"的痕迹：轻微旋转、纸张阴影、虚线分隔、波浪下划线。
- **少即是多**：不要加多余的图标、emoji、渐变、阴影模糊。所有装饰都来自纸张、墨水、排版本身。

## 2. 色板（严格使用，不要自行调色）
```js
const palette = {
  paper:     '#F0E5CC',   // 主纸张底色
  paperDark: '#E5D6B5',   // 次级纸面/卡片底
  paperFold: '#D9C8A3',   // 折痕色（少用）
  ink:       '#2B221A',   // 主文字（深棕墨水）
  inkSoft:   'rgba(43,34,26,0.7)',
  inkFaint:  'rgba(43,34,26,0.45)',
  inkLine:   'rgba(43,34,26,0.15)',   // 虚线/分隔线
  red:       '#A43128',   // 红笔：错误、重点、强调
  amber:     '#B8751A',   // 荧光笔黄：编号、次级强调
  green:     '#4F6B3A',   // 铅笔绿：建议、正向、"更好的做法"
};
```
禁止引入任何蓝色、紫色、霓虹色、纯黑 `#000`、纯白 `#fff`。

## 3. 字体系统（三种，各司其职）
```css
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Caveat:wght@400;600;700&family=Courier+Prime:ital,wght@0,400;0,700&display=swap');
```
- **衬线（正文）**：`"EB Garamond", Georgia, serif` — 所有正文、说明、段落
- **手写（情绪/点评）**：`"Caveat", "Kalam", cursive` — 标题、verdict、Coach's read、签名、标签
- **等宽（数据/元信息）**：`"Courier Prime", "Courier New", monospace` — 编号、金额、频率、小字标签（常配 `letterSpacing: 1`）

**字号规则**：
- 手写大标题 28–32px，手写小标题/装饰 16–22px
- 衬线正文 14–15px，行高 1.5–1.65
- 等宽元信息 10–11px（全大写 + letterSpacing: 1）

## 4. 纸张质感（背景必须加）
```css
background: #F0E5CC;
background-image:
  radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.25) 0%, transparent 50%),
  radial-gradient(ellipse at 80% 80%, rgba(43,34,26,0.08) 0%, transparent 40%),
  repeating-linear-gradient(0deg, transparent 0 2px, rgba(43,34,26,0.015) 2px 3px);
```

## 5. 组件规则

### 卡片（便签/笔记卡）
- 背景 `#F7EED6`（比主纸张稍亮）
- 边框 `1px solid rgba(43,34,26,0.15)`
- 阴影 `2px 3px 0 rgba(43,34,26,0.08)`（硬阴影、不模糊）
- **轻微旋转**：`transform: rotate(-0.4deg)` 或 `rotate(0.3deg)`，每张卡角度不同但幅度不超过 ±0.5deg

### 分隔线
- 一律用虚线或点线：`border-top: 1px dashed rgba(43,34,26,0.15)` / `dotted`
- **绝不**用实线 `solid` 做分隔

### 按钮
- 主按钮：深墨底 `#2B221A` + 纸色字 + 手写字体 + `2px 2px 0` 硬阴影
- 次按钮：透明底 + 墨色边框 1.5px + 墨色字
- 禁用态：`paperDark` 底 + `inkFaint` 字

### 强调/标注
- **红笔下划线**：`text-decoration: underline wavy #A43128; text-underline-offset: 3px`（用于关键动作、当前步骤）
- **荧光笔高亮**：`background: linear-gradient(180deg, transparent 60%, rgba(184,117,26,0.25) 60%); display: inline`
- **印章式 verdict**：小矩形 + 2px 彩色边框 + 手写字 + `rotate(3deg)`
- **标签/tag**：圆角 pill + 红色描边 + 手写字 + 随机 ±1deg 旋转

### 进度/步骤条
- 不要用传统圆点或进度条。用**手写文字串联** + 虚线短横（12×1px）连接，当前步骤红笔波浪下划线。

## 6. 文案语气
- 所有标题用**口语化的提问或陈述**，像教练在对你说话：
  - ✅ "Where did you sit?"  "Two moments to revisit."  "Three leaks to work on."
  - ❌ "Position Selection"  "Analysis Results"  "Leak Report"
- 副标题用**斜体衬线**，像旁白："One's the cause, one's the consequence — work it like that."
- 小标签用手写斜体小写：`coach's read —`、`principle`、`better line`、`prescription`
- 签名收尾：`— Coach` + 斜体小字 "see you at the table."

## 7. 交互动效
- 过渡一律 `transition: all 0.18s`，不要弹簧、不要超过 200ms
- 选中态靠**颜色翻转 + 阴影出现**，不要靠缩放或发光
- 不要骨架屏、不要 loading 旋转器；如需等待，用一句手写字 "coach is reading…"

## 8. 禁用清单
- ❌ 圆角 > 4px（除了 pill 标签的 10px）
- ❌ 渐变背景（除了纸张质感的 radial-gradient）
- ❌ box-shadow 带 blur（全部用硬阴影 `Xpx Ypx 0`）
- ❌ emoji（用手写字符 ★ ✓ → 代替）
- ❌ Material / Tailwind 默认色板
- ❌ 任何 "AI slop" 特征：卡片左侧彩色强调条 + 圆角 + 渐变背景的组合

## 9. 参考实现
见附件 `variant-b-notebook.jsx` — 这是风格的权威来源。遇到新组件需要设计时，先问自己：
1. 这个信息如果真的写在笔记本上，教练会用**哪支笔**写？（墨水 / 红笔 / 荧光笔 / 铅笔）
2. 它是**正文**、**批注**、还是**元信息**？决定字体。
3. 它需要**被翻过的质感**（轻旋转 + 硬阴影），还是平铺在纸上？