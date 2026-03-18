const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const recognizeRouter = require("./routes/recognize");
const geocodeRouter = require("./routes/geocode");
const { setupAsrWebSocket } = require("./routes/asr");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(logger);

// API 路由
app.use("/api/food", recognizeRouter);
app.use("/api/geocode", geocodeRouter);

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// 静态文件服务 - food-tracker demo
app.use("/", express.static(path.join(__dirname, "demo/food-tracker")));

const port = process.env.PORT || 80;

const server = app.listen(port, () => {
  console.log("启动成功", port);
});

setupAsrWebSocket(server);
