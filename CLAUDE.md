# CLAUDE.md

## 语言要求

所有对话、文档、代码注释和 commit message 均使用中文输出。

## 项目概述

- 这是一个微信小程序 Monorepo 项目，多个小程序前端共用一个后端服务，使用 pnpm workspaces 管理，小程序不纳入 pnpm workspace，它们由微信开发者工具独立管理。
- 后端同时托管 H5 Demo 页面，H5 Demo 页面放在 `backend/demo/` 下，由 Express 静态文件中间件提供服务

## 项目结构

```
mini-cloud/
├── backend/                        # 后端服务（Express.js + MySQL），部署到微信云托管
│   ├── index.js                    # Express 主入口
│   ├── routes/                     # API 路由
│   │   ├── food.js                 # 食物识别相关接口（/api/food）
│   │   ├── geocode.js              # 反向地理编码代理（/api/geocode）
│   │   ├── asr.js                  # WebSocket 实时语音识别（/api/asr/realtime）
│   │   ├── chat.js                 # 对话路由（导出 lifeRouter + financeRouter）
│   │   └── records.js              # 数据记录查询（/api/records）
│   ├── services/                   # 业务服务模块
│   │   ├── llm.js                  # LLM 调用封装
│   │   ├── brain.js                # 通用 ReAct 推理循环工厂（createBrain）
│   │   └── skills/                 # 技能模块
│   │       ├── registry.js         # 通用技能注册工厂（createSkillRegistry）
│   │       ├── life-record.js      # 生活记录技能（expense/food/todo/insight）
│   │       └── finance-record.js   # 财务记录技能（expense/income/budget）
│   ├── demo/                       # H5 Demo 页面（静态文件，通过 /demo/* 访问）
│   │   ├── food-tracker/           # 食物记录 Demo（拍照识别，localStorage 存储）
│   │   ├── life-assistant/         # 生活助理 Demo（语音对话，LLM 聊天）
│   │   └── finance-assistant/      # 财务助理 Demo（文字对话，收支记录与分析）
│   └── Dockerfile
├── docs/                           # 项目文档/知识库
│   ├── api/                        # 接口文档（按业务域组织）
│   ├── db/                         # 数据库表结构文档（预留）
│   └── ui/                         # 设计文档
├── miniprogs/                      # 小程序前端项目，每个子目录为一个独立小程序
└── pnpm-workspace.yaml
```

## 常用命令

- 安装依赖：`pnpm install`
- 后端启动：`pnpm dev`
- Docker 构建：`pnpm docker:build`

## 开发指南

- 对于较为重大的更新，需同步变更 CLAUDE.md
- 新增小程序：在 `miniprogs/` 下创建子目录，用微信开发者工具打开
- 新增 API 时：在 `docs/api/` 中对应业务文件里追加章节，新业务域则新建文件
- 新增数据表时：在 `docs/db/` 下新建对应文件
- 修改 API 行为或表结构时：同步更新对应文档
- 新建前端页面遵循 `docs/ui/design-spec.md` 中的设计规范

## 后端 API

- `POST /api/food/recognize` — AI 图片食物识别（详见 `docs/api/food.md`）
- `POST /api/food/recognize-text` — 文本食物识别（详见 `docs/api/food.md`）
- `GET /api/food/models` — 获取可用 AI 模型列表（详见 `docs/api/food.md`）
- `GET /api/geocode/reverse` — 反向地理编码代理（详见 `docs/api/geocode.md`）
- `WebSocket /api/asr/realtime` — 实时语音识别
- `POST /api/chat/completions` — 通用 AI 对话（详见 `docs/api/chat.md`）
- `POST /api/finance-chat/completions` — 财务助理 AI 对话（SSE 流式，支持记账/查询工具）
- `GET /api/wx_openid` — 获取微信 Open ID（小程序专用）

完整接口文档见 `docs/api/` 目录。