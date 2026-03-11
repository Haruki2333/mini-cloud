# 小程序 UI 设计规范

本文档定义项目中小程序和 H5 Demo 页面的通用 UI 设计规范。所有前端项目应遵循此规范，以确保视觉一致性和用户体验质量。

## 设计原则

1. **移动优先** — 以手机屏幕为首要适配目标，最大宽度 480px
2. **简洁温暖** — 圆润的形状、柔和的阴影、舒适的配色
3. **一致性** — 跨页面、跨项目保持统一的视觉语言
4. **可配置** — 基础规范固定，主题色可按项目自定义

## 设计令牌

设计令牌定义在 `packages/design-tokens/` 目录下，包含：

- `base.css` — 基础令牌（间距、圆角、阴影、字体、动画），所有项目共用
- `themes/default.css` — 默认主题（中性蓝灰色调）
- `themes/food-tracker.css` — 食物记录主题（暖色调示例）
- `tokens.json` — JSON 格式的完整令牌定义，供小程序 `app.wxss` 引用

### 使用方式

**H5 页面**：引入 CSS 文件

```html
<link rel="stylesheet" href="/design-tokens/base.css">
<link rel="stylesheet" href="/design-tokens/themes/default.css">
```

**小程序**：将 `tokens.json` 中的变量复制到 `app.wxss` 的 `:root` 或 `page` 选择器中

---

## 1. 色彩系统

### 1.1 语义色彩变量

每个主题必须定义以下 CSS 变量：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `--color-bg` | 页面背景色 | `#f5f5f5` |
| `--color-bg-secondary` | 次级背景色（分区底色） | `#eeeeee` |
| `--color-card` | 卡片/容器背景色 | `#ffffff` |
| `--color-text` | 主文本色 | `#1a1a1a` |
| `--color-text-secondary` | 次要文本色 | `#666666` |
| `--color-text-muted` | 弱化文本色 | `#999999` |
| `--color-border` | 边框色 | `#e0e0e0` |
| `--color-primary` | 主色调 | `#2563eb` |
| `--color-primary-dark` | 主色调深色（按压/hover） | `#1d4ed8` |
| `--color-primary-light` | 主色调浅色（背景高亮） | `#eff6ff` |
| `--color-success` | 成功色 | `#16a34a` |
| `--color-success-light` | 成功色浅色背景 | `#f0fdf4` |
| `--color-warning` | 警告色 | `#f59e0b` |
| `--color-warning-light` | 警告色浅色背景 | `#fffbeb` |
| `--color-danger` | 危险色 | `#dc2626` |
| `--color-danger-light` | 危险色浅色背景 | `#fef2f2` |

### 1.2 主题示例

**默认主题**（中性蓝灰）：适用于工具类、通用型小程序

**食物记录主题**（暖橙色调）：
- 背景 `#faf7f2`（米色）
- 主色 `#e85d26`（橙色）
- 文本 `#2d1810`（深褐色）

### 1.3 自定义主题

新项目只需创建一个主题 CSS 文件，覆盖 `--color-*` 变量即可。基础令牌（间距、圆角等）无需重复定义。

---

## 2. 字体系统

### 2.1 字体族

```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
  'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

优先使用系统字体，确保中文渲染质量。

### 2.2 字号

| 令牌名 | 大小 | 用途 |
|--------|------|------|
| `--font-size-xs` | `11px` | 辅助信息、角标 |
| `--font-size-sm` | `13px` | 次要文本、标签 |
| `--font-size-base` | `15px` | 正文 |
| `--font-size-lg` | `17px` | 标题、按钮文字 |
| `--font-size-xl` | `20px` | 页面标题 |
| `--font-size-2xl` | `24px` | 大标题 |

### 2.3 行高

| 令牌名 | 值 | 用途 |
|--------|------|------|
| `--line-height-tight` | `1.25` | 标题 |
| `--line-height-base` | `1.5` | 正文 |
| `--line-height-relaxed` | `1.75` | 长段落 |

### 2.4 字重

| 令牌名 | 值 | 用途 |
|--------|------|------|
| `--font-weight-normal` | `400` | 正文 |
| `--font-weight-medium` | `500` | 强调文本 |
| `--font-weight-bold` | `600` | 标题 |

---

## 3. 间距系统

使用 4px 为基数的间距系统：

| 令牌名 | 值 | 用途 |
|--------|------|------|
| `--spacing-xs` | `4px` | 紧凑间隙 |
| `--spacing-sm` | `8px` | 元素内间距 |
| `--spacing-md` | `12px` | 相关元素间距 |
| `--spacing-base` | `16px` | 标准间距 |
| `--spacing-lg` | `24px` | 区块间距 |
| `--spacing-xl` | `32px` | 页面级间距 |
| `--spacing-2xl` | `48px` | 大区块分隔 |

### 间距使用原则

- **内边距**（padding）：卡片内容区用 `--spacing-base`，输入框用 `--spacing-sm` ~ `--spacing-md`
- **外边距**（margin）：同级元素间用 `--spacing-md`，区块间用 `--spacing-lg`
- **页面水平边距**：统一使用 `--spacing-base`（16px）

---

## 4. 圆角

| 令牌名 | 值 | 用途 |
|--------|------|------|
| `--radius-sm` | `6px` | 小元素（标签、小按钮） |
| `--radius-base` | `8px` | 输入框、普通按钮 |
| `--radius-lg` | `12px` | 卡片、弹窗 |
| `--radius-xl` | `20px` | 胶囊型元素（开关、选择器） |
| `--radius-full` | `9999px` | 圆形（头像、FAB 按钮） |

---

## 5. 阴影

| 令牌名 | 值 | 用途 |
|--------|------|------|
| `--shadow-sm` | `0 1px 4px rgba(0,0,0,0.06)` | 轻微浮起 |
| `--shadow-base` | `0 2px 8px rgba(0,0,0,0.08)` | 卡片默认 |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.12)` | 弹窗、悬浮元素 |
| `--shadow-primary` | `0 4px 12px color-mix(in srgb, var(--color-primary) 40%, transparent)` | 主色按钮 |

---

## 6. 动画

| 令牌名 | 值 | 用途 |
|--------|------|------|
| `--duration-fast` | `150ms` | 颜色变化、透明度 |
| `--duration-base` | `250ms` | 常规过渡 |
| `--duration-slow` | `400ms` | 页面切换、展开收起 |
| `--easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | 通用缓动 |
| `--easing-in` | `cubic-bezier(0.4, 0, 1, 1)` | 进入 |
| `--easing-out` | `cubic-bezier(0, 0, 0.2, 1)` | 退出 |

---

## 7. 组件规范

### 7.1 按钮

**主要按钮**（`.btn-primary`）：
- 背景 `var(--color-primary)`，文字白色
- 字号 `--font-size-lg`（17px），字重 `--font-weight-medium`
- 内边距 `12px 0`，全宽显示
- 圆角 `--radius-base`（8px）
- 按压态：背景变为 `var(--color-primary-dark)`，缩放 `scale(0.98)`
- 禁用态：透明度 50%，不可点击

**次要按钮**（`.btn-secondary`）：
- 白色背景，`1.5px` 主色边框
- 文字 `var(--color-primary)`
- Hover/按压态：背景变为 `var(--color-primary-light)`

**危险按钮**（`.btn-danger`）：
- 背景 `var(--color-danger-light)`，文字 `var(--color-danger)`
- Hover/按压态：背景加深

**文字按钮**（`.btn-text`）：
- 无背景无边框，仅文字
- 用于次要操作

### 7.2 输入框

- 边框 `1px solid var(--color-border)`
- 圆角 `--radius-base`
- 内边距 `10px 12px`
- 字号 `--font-size-base`
- 聚焦态：边框变为 `var(--color-primary)`
- 占位文字颜色：`var(--color-text-muted)`

### 7.3 卡片

- 背景 `var(--color-card)`
- 圆角 `--radius-lg`（12px）
- 阴影 `--shadow-base`
- 内边距 `--spacing-base`
- 按压反馈：`scale(0.98)` + `transition: transform var(--duration-fast)`

### 7.4 标签（Tag）

- 内边距 `2px 10px`
- 圆角 `--radius-xl`（20px）
- 字号 `--font-size-sm`（13px）
- 默认样式：`var(--color-primary-light)` 背景 + `var(--color-primary)` 文字
- 语义变体：success（绿色背景+文字）、warning（黄色背景+文字）

### 7.5 页面头部（Header）

- 固定在顶部，高度 `44px`
- 背景 `var(--color-card)`
- 底部 `1px` 边框 `var(--color-border)`
- 标题居中，字号 `--font-size-lg`，字重 `--font-weight-bold`
- 两侧操作区宽度固定，内容居中对齐

### 7.6 悬浮操作按钮（FAB）

- 尺寸 `56px × 56px`，圆形
- 固定于右下角，距底部和右侧各 `24px`
- 阴影 `--shadow-primary`
- 按压态：`scale(0.92)`

### 7.7 加载状态

**Spinner**：
- 尺寸 `16px`（行内）或 `32px`（全屏）
- `2px` 边框，`border-top-color: transparent`
- 旋转动画 `0.8s linear infinite`

**全屏加载遮罩**：
- 半透明黑色背景 `rgba(0,0,0,0.5)`
- 居中白色卡片，包含 Spinner + 提示文字

### 7.8 空状态

- 居中布局
- 图标/插图 + 标题 + 描述文字
- 可选操作按钮

### 7.9 列表项

- 左右布局：左侧主内容，右侧辅助信息或箭头
- 行高 `48px`（最小触控目标）
- 分割线使用 `1px solid var(--color-border)`，左侧缩进 `--spacing-base`

---

## 8. 布局规范

### 8.1 页面结构

```
┌─────────────────────┐
│       Header        │  固定顶部，44px
├─────────────────────┤
│                     │
│      Content        │  可滚动区域
│                     │  padding: 16px
│                     │
├─────────────────────┤
│  Bottom Bar / FAB   │  可选，固定底部
└─────────────────────┘
```

### 8.2 最大宽度

- 页面 `max-width: 480px`，居中
- 内容区水平内边距 `16px`

### 8.3 安全区适配

底部固定元素需考虑 iPhone 安全区域：

```css
padding-bottom: calc(24px + env(safe-area-inset-bottom));
```

---

## 9. 交互规范

### 9.1 触控反馈

- 所有可点击元素必须有按压态反馈
- 按钮：颜色变深 + 轻微缩放
- 卡片：轻微缩放 `scale(0.98)`
- 列表项：背景变为 `var(--color-bg)`

### 9.2 最小触控目标

- 可点击元素最小尺寸 `44px × 44px`
- 紧凑布局中可缩小到 `36px`，但需增大触控热区

### 9.3 操作确认

- 删除等不可逆操作必须弹窗确认
- 确认弹窗中危险按钮用红色突出

### 9.4 过渡动画

- 页面切换：`var(--duration-slow)` + `var(--easing-default)`
- 状态切换：`var(--duration-base)` + `var(--easing-default)`
- 颜色变化：`var(--duration-fast)`

---

## 10. 小程序特殊规范

### 10.1 导航栏

- 使用微信原生导航栏（`navigationBarTitleText`）
- 导航栏背景色设为 `--color-card` 对应值
- 文字颜色根据背景深浅选择 `black` 或 `white`

### 10.2 下拉刷新

- 背景色设为 `--color-bg` 对应值

### 10.3 页面配置示例

```json
{
  "navigationBarBackgroundColor": "#ffffff",
  "navigationBarTextStyle": "black",
  "backgroundColor": "#f5f5f5"
}
```

### 10.4 WXSS 变量

小程序不支持 `:root`，使用 `page` 选择器定义变量：

```css
page {
  --color-primary: #2563eb;
  /* ...其他变量 */
}
```

---

## 11. H5 Demo 适配

H5 Demo 页面应遵循本规范，并注意以下差异：

- 使用 `<link>` 引入设计令牌 CSS 文件
- Header 用 HTML 实现（小程序用原生导航栏）
- 使用 `viewport` meta 标签确保移动端适配：
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  ```
- 底部安全区使用 `env(safe-area-inset-bottom)`
