# CLAUDE.md

## 语言要求

所有对话、文档、代码注释和 commit message 均使用中文输出。

## 项目概述

这是一个微信小程序 Monorepo 项目，多个小程序前端共用一个后端服务。后端同时托管 H5 Demo 页面。

## 项目结构

```
mini-cloud/
├── backend/                        # 后端服务（Express.js + MySQL），部署到微信云托管
│   ├── index.js                    # Express 主入口
│   ├── db.js                       # 数据库连接（Sequelize）
│   ├── routes/                     # API 路由
│   │   └── recognize.js            # POST /api/recognize - AI 食物识别
│   ├── demo/                       # H5 Demo 页面（静态文件，通过 /demo/* 访问）
│   │   └── food-tracker/           # 食物记录 Demo
│   ├── Dockerfile
│   └── container.config.json
├── miniprogs/                      # 小程序前端项目，每个子目录为一个独立小程序
├── packages/                       # 共享包（按需创建）
└── pnpm-workspace.yaml
```

## 开发指南

- 包管理器：pnpm（使用 pnpm workspaces 管理 monorepo）
- 后端启动：`pnpm dev`
- Docker 构建：`pnpm docker:build`
- 新增小程序：在 `miniprogs/` 下创建子目录，用微信开发者工具打开
- 小程序不纳入 pnpm workspace，它们由微信开发者工具独立管理
- H5 Demo 页面放在 `backend/demo/` 下，由 Express 静态文件中间件提供服务

## 后端 API

- `POST /api/recognize` — AI 食物识别（需要 `X-Api-Key` 请求头，支持智谱/Gemini/OpenAI）
- `GET /api/wx_openid` — 获取微信 Open ID（小程序专用）

## Demo 页面

- `/demo/food-tracker/` — 食物记录 H5 应用（拍照识别食物，localStorage 存储记录）
