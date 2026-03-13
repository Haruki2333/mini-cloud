# 地理编码 API

## 反向地理编码

将经纬度坐标转换为可读的地址字符串。后端代理腾讯地图 WebService API，避免前端跨域问题和 API Key 泄露。

### 请求

```
GET /api/geocode/reverse?lat={纬度}&lng={经度}
```

**Query 参数**

| 参数 | 类型   | 必填 | 说明       |
|------|--------|------|------------|
| lat  | number | 是   | 纬度       |
| lng  | number | 是   | 经度       |

### 响应

**成功 200**

```json
{
  "address": "北京市朝阳区三里屯街道"
}
```

**错误 400**

```json
{
  "error": "缺少 lat 或 lng 参数"
}
```

**错误 500**（未配置 API Key）

```json
{
  "error": "未配置 TENCENT_MAP_KEY"
}
```

**错误 502**（腾讯地图 API 返回错误）

```json
{
  "error": "地理编码失败"
}
```

### 环境变量

| 变量名           | 说明                          |
|------------------|-----------------------------|
| TENCENT_MAP_KEY  | 腾讯地图 WebService API Key   |

### 使用场景

前端在拍照/选图后，从 EXIF 提取 GPS 坐标（或浏览器 Geolocation 兜底），调用此接口获取可读地址，存入食物记录中。
