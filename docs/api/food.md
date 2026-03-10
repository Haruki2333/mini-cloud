# 食物 API

## GET /api/food/models

获取可用的 AI 模型列表。

### 成功响应（200）

```json
[
  { "id": "glm-4.6v-flash", "provider": "zhipu", "label": "智谱 GLM-4.6V-Flash" },
  { "id": "glm-4.6v-flashx", "provider": "zhipu", "label": "智谱 GLM-4.6V-FlashX" },
  { "id": "qwen3.5-flash", "provider": "qwen", "label": "千问 Qwen3.5-Flash" }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 模型 ID，用于 recognize 接口的 model 参数 |
| provider | string | 厂商标识（zhipu / qwen） |
| label | string | 模型显示名称 |

### 实现位置

`backend/routes/recognize.js`

---

## POST /api/food/recognize

AI 食物识别，根据图片识别菜品信息。

### 认证

| 请求头 | 必填 | 说明 |
|--------|------|------|
| X-Api-Key | 是 | 对应模型厂商的 API Key |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageBase64 | string | 是 | Base64 编码的图片（含 `data:image/xxx;base64,` 前缀） |
| model | string | 否 | 模型 ID，默认 `glm-4.6v-flash` |

### 支持的模型

| 模型 ID | 名称 | 厂商 |
|---------|------|------|
| glm-4.6v-flash | GLM-4.6V-Flash | 智谱 AI |
| glm-4.6v-flashx | GLM-4.6V-FlashX | 智谱 AI |
| qwen3.5-flash | Qwen3.5-Flash | 阿里千问（DashScope） |

### 成功响应（200）

```json
{
  "name": "宫保鸡丁",
  "ingredients": ["鸡胸肉", "花生", "干辣椒"],
  "cookingMethod": "爆炒",
  "tags": ["川菜", "辣", "家常菜"],
  "description": "一段50字左右的美食描述",
  "model": "glm-4.6v-flash"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 菜名，解析失败时为 "未知菜品" |
| ingredients | string[] | 食材列表 |
| cookingMethod | string | 烹饪方式 |
| tags | string[] | 标签（菜系、口味、类型等） |
| description | string | AI 生成的美食描述 |
| model | string | 实际使用的模型 ID |

### 错误响应

| 状态码 | error | 触发条件 |
|--------|-------|----------|
| 400 | 缺少图片数据 | 请求体中无 imageBase64 |
| 400 | 不支持的模型 | model 对应的模型不存在 |
| 401 | 缺少 API Key | 请求头中无 X-Api-Key |
| 500 | AI 调用失败 / JSON 解析失败 | 上游 API 错误或返回格式异常 |

### 实现位置

`backend/routes/recognize.js`

### LLM 服务层

食物识别的大模型调用委托给通用 LLM 服务层 `backend/services/llm.js`，详见 [LLM 服务层文档](llm.md)。
