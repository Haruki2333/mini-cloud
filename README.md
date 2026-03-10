# mini-cloud

微信小程序 Monorepo 项目 —— 多个小程序前端共用一个后端服务。

## 项目结构

```
.
├── backend/                          # 后端服务（Express.js + MySQL）
│   ├── index.js                      # Express 主入口
│   ├── routes/
│   │   └── recognize.js              # AI 食物识别 API
│   ├── demo/
│   │   └── food-tracker/             # 食物记录 H5 Demo
│   │       ├── index.html            # 主页（时间线）
│   │       ├── add.html              # 新增记录页
│   │       ├── detail.html           # 详情页
│   │       ├── settings.html         # 设置页
│   │       ├── css/style.css         # 样式
│   │       └── js/                   # 前端逻辑
│   ├── package.json                  # 后端依赖定义
│   └── Dockerfile                    # 容器配置文件
├── docs/                             # 项目文档/知识库
│   ├── api/                          # 接口文档（按业务域组织）
│   └── db/                           # 数据库表结构文档
├── miniprogs/                        # 小程序前端项目（每个子目录为一个独立小程序）
├── packages/                         # 共享包（按需创建）
├── package.json                      # Monorepo 根配置
└── pnpm-workspace.yaml               # pnpm workspace 配置
```

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动后端

```bash
pnpm dev
```

### Docker 构建与运行

```bash
pnpm docker:build
pnpm docker:run
```

### 添加新的小程序前端

在 `miniprogs/` 下创建新目录，使用微信开发者工具打开该目录即可。每个小程序通过 `wx.request()` 调用共享的后端 API。

## 后端 API

- `POST /api/food/recognize` — AI 食物识别（需要 `X-Api-Key` 请求头，支持智谱/Gemini/OpenAI）
- `GET /api/wx_openid` — 获取微信 Open ID（小程序专用）

完整 API 文档、数据库文档详见 [`docs/`](./docs) 目录。

## Demo 页面

后端同时托管 H5 Demo 页面，访问根路径 `/` 会重定向到默认 Demo。

### 食物记录（Food Tracker）

访问路径：`/demo/food-tracker/`

功能：
- 拍照或上传食物图片，AI 自动识别菜名、食材、烹饪方式
- 支持三个 AI 等级：体验版（智谱 GLM-4V）、标准版（Gemini 2.0 Flash）、高级版（GPT-4o）
- 记录以时间线形式展示，数据存储在浏览器 localStorage 中
- 支持在设置页配置各 AI 提供商的 API Key

## License

[Apache-2.0](./LICENSE)
