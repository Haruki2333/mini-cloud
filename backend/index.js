// 为所有日志注入毫秒级时间戳，解决云托管日志平台秒级精度导致的乱序问题
// 注意：必须先用 util.format 把参数合并成完整字符串，否则时间戳变成首参数会让
// 后续参数中的 %d/%s 等格式化指令失效（util.format 只对首个 string 启用 specifier）
const util = require("util");
const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);
const _ts = () => new Date().toISOString().replace("T", " ").slice(0, 23);
console.log = (...a) => _origLog(`[${_ts()}] ${util.format(...a)}`);
console.warn = (...a) => _origWarn(`[${_ts()}] ${util.format(...a)}`);
console.error = (...a) => _origError(`[${_ts()}] ${util.format(...a)}`);

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
