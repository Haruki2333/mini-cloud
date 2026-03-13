const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

// GET /api/geocode/reverse?lat=xxx&lng=xxx — 反向地理编码（腾讯地图代理）
router.get("/reverse", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "缺少 lat 或 lng 参数" });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: "lat 和 lng 必须是有效数字" });
    }

    const key = process.env.TENCENT_MAP_KEY;
    if (!key) {
      return res.status(500).json({ error: "未配置 TENCENT_MAP_KEY" });
    }

    const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latNum},${lngNum}&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 0) {
      console.error("腾讯地图 API 错误:", data.message);
      return res.status(502).json({ error: data.message || "地理编码失败" });
    }

    const result = data.result;
    const address = result.formatted_addresses?.recommend || result.address || "";

    res.json({ address });
  } catch (err) {
    console.error("反向地理编码失败:", err.message);
    res.status(500).json({ error: "地理编码服务异常" });
  }
});

module.exports = router;
