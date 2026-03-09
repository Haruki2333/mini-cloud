# mini-cloud

微信小程序 Monorepo 项目 —— 多个小程序前端共用一个后端服务。

## 项目结构

```
.
├── backend/                  # 后端服务（Express.js + MySQL）
│   ├── index.js              # 项目入口，实现主要的读写 API
│   ├── db.js                 # 数据库相关实现，使用 sequelize 作为 ORM
│   ├── index.html            # 首页代码
│   ├── package.json          # 后端依赖定义
│   ├── Dockerfile            # 容器配置文件
│   └── container.config.json # 模板部署「服务设置」初始化配置
├── miniprogs/                # 小程序前端项目（每个子目录为一个独立小程序）
├── packages/                 # 共享包（按需创建）
├── package.json              # Monorepo 根配置
└── pnpm-workspace.yaml       # pnpm workspace 配置
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

## 后端 API 文档

### `GET /api/count`

获取当前计数

**响应示例：**

```json
{
  "code": 0,
  "data": 42
}
```

### `POST /api/count`

更新计数，自增或清零

**请求参数：**

- `action`：`"inc"` 计数加一，`"clear"` 计数清零

**请求示例：**

```bash
curl -X POST -H 'content-type: application/json' -d '{"action": "inc"}' https://<云托管服务域名>/api/count
```

## 使用注意

如果不是通过微信云托管控制台部署模板代码，而是自行复制/下载模板代码后，手动新建一个服务并部署，需要在「服务设置」中补全以下环境变量：

- `MYSQL_ADDRESS`
- `MYSQL_PASSWORD`
- `MYSQL_USERNAME`

以上三个变量的值请按实际情况填写。如果使用云托管内 MySQL，可以在控制台 MySQL 页面获取相关信息。

## License

[Apache-2.0](./LICENSE)
