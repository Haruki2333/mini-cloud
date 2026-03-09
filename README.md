# mini-cloud

微信小程序 Monorepo 项目 —— 多个小程序前端共用一个后端服务。

## 项目结构

```
.
├── backend/                          # 后端服务（Express.js + MySQL）
│   ├── index.js                      # Express 主入口
│   ├── db.js                         # 数据库连接，使用 Sequelize 作为 ORM
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
│   ├── Dockerfile                    # 容器配置文件
│   └── container.config.json         # 模板部署「服务设置」初始化配置
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

## 后端 API 文档

### `POST /api/recognize`

AI 食物识别 —— 接收食物照片，返回识别结果（菜名、食材、烹饪方式等）。

**请求头：**

- `Content-Type: application/json`
- `X-Api-Key: <对应 AI 提供商的 API Key>`

**请求参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageBase64` | string | 图片的 base64 编码（不含 `data:image/...;base64,` 前缀） |
| `tier` | number | 识别等级：`1` 体验版（智谱）、`2` 标准版（Gemini）、`3` 高级版（OpenAI） |

**响应示例：**

```json
{
  "name": "番茄炒蛋",
  "ingredients": ["番茄", "鸡蛋", "葱花"],
  "cookingMethod": "炒",
  "tags": ["家常菜", "快手菜"],
  "description": "经典家常菜，番茄的酸甜搭配鸡蛋的嫩滑...",
  "model": "glm-4v-flash"
}
```

### `GET /api/wx_openid`

获取微信 Open ID（仅在微信云托管环境下，通过小程序调用时有效）。

## Demo 页面

后端同时托管 H5 Demo 页面，访问根路径 `/` 会重定向到默认 Demo。

### 食物记录（Food Tracker）

访问路径：`/demo/food-tracker/`

功能：
- 拍照或上传食物图片，AI 自动识别菜名、食材、烹饪方式
- 支持三个 AI 等级：体验版（智谱 GLM-4V）、标准版（Gemini 2.0 Flash）、高级版（GPT-4o）
- 记录以时间线形式展示，数据存储在浏览器 localStorage 中
- 支持在设置页配置各 AI 提供商的 API Key

## 使用注意

如果不是通过微信云托管控制台部署模板代码，而是自行复制/下载模板代码后，手动新建一个服务并部署，需要在「服务设置」中补全以下环境变量：

- `MYSQL_ADDRESS`
- `MYSQL_PASSWORD`
- `MYSQL_USERNAME`

以上三个变量的值请按实际情况填写。如果使用云托管内 MySQL，可以在控制台 MySQL 页面获取相关信息。

## License

[Apache-2.0](./LICENSE)
