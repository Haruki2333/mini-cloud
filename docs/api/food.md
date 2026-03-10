# 食物 API

## POST /api/food/recognize

AI 食物识别，根据图片识别菜品信息。

### 认证

| 请求头 | 必填 | 说明 |
|--------|------|------|
| X-Api-Key | 是 | 对应 tier 模型提供商的 API Key |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| imageBase64 | string | 是 | Base64 编码的图片（含 `data:image/xxx;base64,` 前缀） |
| tier | number | 否 | 模型等级，默认 1 |

### 模型等级

| Tier | 名称 | 模型 | 提供商 |
|------|------|------|--------|
| 1 | 体验版 | glm-4v-flash | 智谱 AI |
| 2 | 标准版 | gemini-2.0-flash | Google Gemini |
| 3 | 高级版 | gpt-4o | OpenAI |

### 成功响应（200）

```json
{
  "name": "宫保鸡丁",
  "ingredients": ["鸡胸肉", "花生", "干辣椒"],
  "cookingMethod": "爆炒",
  "tags": ["川菜", "辣", "家常菜"],
  "description": "一段50字左右的美食描述",
  "model": "glm-4v-flash"
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
| 400 | 不支持的模型 | tier 对应的 provider 未匹配 |
| 401 | 缺少 API Key | 请求头中无 X-Api-Key |
| 500 | AI 调用失败 / JSON 解析失败 | 上游 API 错误或返回格式异常 |

### 实现位置

`backend/routes/recognize.js`
