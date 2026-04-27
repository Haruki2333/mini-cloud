/**
 * 数据库连接管理模块
 *
 * 负责 Sequelize 连接创建和数据库初始化。
 * 模型定义由各业务模块通过 initDB(modelDefiner) 参数注入。
 */

const { Sequelize } = require("sequelize");

// 解析环境变量
const [host, port] = (process.env.MYSQL_ADDRESS || "127.0.0.1:3306").split(":");
const username = process.env.MYSQL_USERNAME || "root";
const password = process.env.MYSQL_PASSWORD || "";
const database = process.env.MYSQL_DATABASE || "mini_cloud";

// Sequelize 实例（延迟到 initDB 中创建，需先确保数据库存在）
let sequelize = null;

/**
 * 初始化数据库
 *
 * @param {...{ define: Function, afterSync?: Function }} modelDefiners
 *   每个 modelDefiner 需提供：
 *   - define(sequelize): 定义 Sequelize 模型和关联关系
 *   - afterSync(queryInterface): 可选，sync 后创建索引等
 */
async function initDB(...modelDefiners) {
  // 先用无数据库的连接创建数据库
  const tempSeq = new Sequelize({
    dialect: "mysql",
    host,
    port: parseInt(port) || 3306,
    username,
    password,
    logging: false,
  });

  await tempSeq.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await tempSeq.close();

  // 创建正式连接
  sequelize = new Sequelize({
    dialect: "mysql",
    host,
    port: parseInt(port) || 3306,
    username,
    password,
    database,
    logging: false,
    // 防止云环境 NAT/负载均衡静默关闭空闲 TCP 连接后池里出现死连接。
    // mysql2 用 enableKeepAlive，老版本的 keepAlive 选项会被警告并忽略
    dialectOptions: {
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 30000,
    },
    pool: { max: 5, min: 0, idle: 10000, acquire: 30000, evict: 5000 },
    define: { charset: "utf8mb4" },
  });

  // 调用各业务模块的模型定义
  for (const m of modelDefiners) {
    m.define(sequelize);
  }

  // 同步表结构（自动创建新表、为已有表补齐新列）
  await sequelize.sync({ alter: true });

  // 调用各业务模块的 sync 后操作（如创建索引）
  const qi = sequelize.getQueryInterface();
  for (const m of modelDefiners) {
    if (m.afterSync) await m.afterSync(qi);
  }

  console.log("[DB] 数据库初始化完成");
}

function getSequelize() {
  return sequelize;
}

module.exports = { initDB, getSequelize };
