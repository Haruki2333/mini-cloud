# 食物 API

## GET /api/food/models

获取可用的 AI 模型列表。

### 成功响应（200）

```json
[
  { "id": "glm-4.6v", "provider": "zhipu", "label": "智谱 GLM-4.6V" },
  { "id": "qwen3.5-plus", "provider": "qwen", "label": "千问 Qwen3.5-Plus" }
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
| model | string | 否 | 模型 ID，默认 `glm-4.6v` |

### 支持的模型

| 模型 ID | 名称 | 厂商 |
|---------|------|------|
| glm-4.6v | GLM-4.6V | 智谱 AI |
| qwen3.5-plus | Qwen3.5-Plus | 阿里千问（DashScope） |

### 成功响应（200）

```json
{
  "name": "宫保鸡丁",
  "ingredients": ["鸡胸肉", "花生", "干辣椒"],
  "cookingMethod": "爆炒",
  "nutrition": {
    "calories": 380,
    "protein": 28,
    "fat": 18,
    "carbs": 25,
    "fiber": 3
  },
  "model": "glm-4.6v"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 菜名，解析失败时为 "未知菜品" |
| ingredients | string[] | 食材列表 |
| cookingMethod | string | 烹饪方式 |
| nutrition | object | 营养成分预估 |
| nutrition.calories | number | 热量（千卡/份） |
| nutrition.protein | number | 蛋白质（克） |
| nutrition.fat | number | 脂肪（克） |
| nutrition.carbs | number | 碳水化合物（克） |
| nutrition.fiber | number | 膳食纤维（克） |
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

---

## POST /api/food/recognize-text

文本描述食物识别，从用户的口语描述中提取食物信息并分析营养成分。

### 认证

| 请求头 | 必填 | 说明 |
|--------|------|------|
| X-Api-Key | 是 | 对应模型厂商的 API Key |

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 用户对食物的文字描述（如"一碗牛肉面加鸡蛋"） |
| model | string | 否 | 模型 ID，默认 `glm-4.6v` |

### 成功响应（200）

```json
{
  "name": "牛肉面",
  "ingredients": ["牛肉", "面条", "鸡蛋"],
  "cookingMethod": "煮",
  "nutrition": {
    "calories": 520,
    "protein": 25,
    "fat": 12,
    "carbs": 75,
    "fiber": 3
  },
  "model": "glm-4.6v"
}
```

响应字段与 `POST /api/food/recognize` 完全一致。

### 错误响应

| 状态码 | error | 触发条件 |
|--------|-------|----------|
| 400 | 缺少文本描述 | 请求体中无 text 或为空 |
| 400 | 不支持的模型 | model 对应的模型不存在 |
| 401 | 缺少 API Key | 请求头中无 X-Api-Key |
| 500 | AI 调用失败 / JSON 解析失败 | 上游 API 错误或返回格式异常 |

### 实现位置

`backend/routes/recognize.js`
