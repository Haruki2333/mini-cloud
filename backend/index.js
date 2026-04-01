const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { financeRouter: financeChatRouter } = require("./routes/chat");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(logger);

// API 路由
app.use("/api/finance-chat", financeChatRouter);

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// 静态文件服务
app.use("/", express.static(path.join(__dirname, "demo/finance-assistant")));

const port = process.env.PORT || 80;

app.listen(port, () => {
  console.log("启动成功", port);
});
