# CLAUDE.md

## 语言要求

所有对话、文档、代码注释和 commit message 均使用中文输出。

## 项目概述

这是一个微信小程序 Monorepo 项目，多个小程序前端共用一个后端服务。

## 项目结构

```
mini-cloud/
├── backend/       # 后端服务（Express.js + MySQL），部署到微信云托管
├── miniprogs/     # 小程序前端项目，每个子目录为一个独立小程序
├── packages/      # 共享包（按需创建）
└── pnpm-workspace.yaml
```

## 开发指南

- 包管理器：pnpm（使用 pnpm workspaces 管理 monorepo）
- 后端启动：`pnpm dev`
- Docker 构建：`pnpm docker:build`
- 新增小程序：在 `miniprogs/` 下创建子目录，用微信开发者工具打开
- 小程序不纳入 pnpm workspace，它们由微信开发者工具独立管理
