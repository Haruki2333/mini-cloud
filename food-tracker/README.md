# food-tracker

基于 Next.js 16 的手机食物记录原型。拍照上传食物图片，AI 自动识别菜名、食材、烹饪方式，按时间线浏览历史记录。支持三个用户等级，映射不同视觉大模型。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) |
| UI | React 18 |
| 语言 | TypeScript (strict) |
| 样式 | CSS 自定义属性（暖色美食主题） |
| 数据存储 | localStorage |
| Node.js | ≥ 18.17 |

## 源码结构

```
app/
├── api/
│   └── recognize/route.ts      # AI 食物识别 API（支持多模型）
├── add/page.tsx                 # 新增记录页面
├── detail/[id]/page.tsx         # 食物详情页
├── settings/page.tsx            # API Key 设置页
├── components/
│   ├── FoodCard.tsx             # 食物卡片组件
│   ├── PhotoUpload.tsx          # 拍照/上传组件
│   ├── TierSwitch.tsx           # 等级切换组件
│   └── TagInput.tsx             # 标签输入组件
├── lib/
│   ├── types.ts                 # 类型定义
│   └── storage.ts               # localStorage 封装
├── globals.css                  # 全局样式
├── layout.tsx                   # 根布局
└── page.tsx                     # 主页（时间线）
```

## 安装与启动

```bash
cd prototypes/food-tracker
npm install
npm run dev
```

访问 http://localhost:3000

## 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |

## 用户等级与模型映射

| 等级 | 名称 | 模型 | 提供商 |
|---|---|---|---|
| 1 | 体验版 | GLM-4V Flash | 智谱 |
| 2 | 标准版 | Gemini 2.0 Flash | Google |
| 3 | 高级版 | GPT-4o | OpenAI |

用户在前端切换等级后，上传食物图片会自动调用对应模型进行识别。

## 环境变量

本原型不使用服务端环境变量。所有 API Key 由用户在设置页面输入，存储在浏览器 localStorage 中，通过请求头传递给后端 API 路由。

## API 接口

### POST /api/recognize

AI 识别食物图片。

**请求头**：
- `Content-Type: application/json`
- `X-Api-Key: <对应模型的 API Key>`

**请求体**：
```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "tier": 2
}
```

**响应体**：
```json
{
  "name": "红烧肉",
  "ingredients": ["五花肉", "酱油", "冰糖", "八角"],
  "cookingMethod": "红烧",
  "tags": ["中餐", "家常菜"],
  "description": "这道红烧肉色泽红亮，肥瘦相间...",
  "model": "gemini-2.0-flash"
}
```

## 功能说明

1. **拍照/上传**：支持手机拍照和从相册选择图片，自动压缩到 800px
2. **AI 识别**：上传后自动调用对应等级的视觉模型，识别菜名、食材、烹饪方式
3. **时间线浏览**：主页按时间倒序展示所有记录
4. **详情查看**：点击卡片查看大图和完整信息
5. **等级切换**：顶部分段控制器切换体验版/标准版/高级版
6. **设置页面**：配置各模型的 API Key
