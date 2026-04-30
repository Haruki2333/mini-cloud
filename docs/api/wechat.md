# 微信小程序工具接口

挂载路径：`/api`

---

## GET /api/wx_openid

获取当前微信用户的 Open ID。仅在微信云托管环境中有效，由平台自动注入 `x-wx-openid` 请求头。

**请求头**

| 字段            | 说明                                           |
|-----------------|------------------------------------------------|
| `x-wx-source`   | 微信云托管注入（存在时才返回 openid）          |
| `x-wx-openid`   | 微信云托管注入的用户 Open ID                   |

**响应**

成功时返回纯文本格式的 Open ID（非 JSON）：

```
oXXXX-xxxxxxxxxxxxxxxxxxxx
```

若 `x-wx-source` 请求头不存在（即非微信云托管环境），接口不返回任何内容（空响应）。

**说明**

- 本接口仅供微信小程序调用，H5 Demo 无需使用（H5 Demo 使用前端生成的 UUID 匿名令牌）
- 实现位置：`backend/index.js`（直接挂载，不经过 `routes/` 目录）
