const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { initDB } = require("./services/core/db");
const pokerModels = require("./services/poker-coach/models");
const { pokerRouter } = require("./routes/poker");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(logger);

// API 路由
app.use("/api/poker", pokerRouter);

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// 静态文件服务
app.use("/poker", express.static(path.join(__dirname, "demo/poker-coach")));
app.get("/", (req, res) => res.redirect("/poker/"));

const port = process.env.PORT || 80;

async function start() {
  await initDB(pokerModels);
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

start().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
