/**
 * 数据库初始化模块
 * 使用 Sequelize ORM 连接 MySQL，定义模型，自动建表
 */

const { Sequelize, DataTypes } = require("sequelize");

// 解析环境变量
const [host, port] = (process.env.MYSQL_ADDRESS || "127.0.0.1:3306").split(":");
const username = process.env.MYSQL_USERNAME || "root";
const password = process.env.MYSQL_PASSWORD || "";
const database = process.env.MYSQL_DATABASE || "mini_cloud";

// Sequelize 实例（延迟到 initDB 中创建，需先确保数据库存在）
let sequelize = null;

// ===== 模型定义 =====

let User, FinanceRecord, UserCategory, MonthlySummary;

function defineModels(seq) {
  User = seq.define(
    "User",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      openid: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      anon_token: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      name: { type: DataTypes.STRING(50), defaultValue: "" },
    },
    { tableName: "users", underscored: true }
  );

  FinanceRecord = seq.define(
    "FinanceRecord",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      type: { type: DataTypes.ENUM("expense", "income", "budget"), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      category: { type: DataTypes.STRING(20), allowNull: true },
      source: { type: DataTypes.STRING(20), allowNull: true },
      description: { type: DataTypes.STRING(200), allowNull: true },
      period: { type: DataTypes.ENUM("日", "周", "月"), allowNull: true },
      record_date: { type: DataTypes.DATEONLY, allowNull: false },
    },
    { tableName: "finance_records", underscored: true, updatedAt: false }
  );

  UserCategory = seq.define(
    "UserCategory",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(20), allowNull: false },
      sort_order: { type: DataTypes.TINYINT.UNSIGNED, defaultValue: 0 },
    },
    { tableName: "user_categories", underscored: true, updatedAt: false }
  );

  MonthlySummary = seq.define(
    "MonthlySummary",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      month: { type: DataTypes.CHAR(7), allowNull: false },
      total_expense: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      total_income: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      net_income: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      expense_by_category: { type: DataTypes.JSON, allowNull: true },
      income_by_source: { type: DataTypes.JSON, allowNull: true },
      record_count: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    },
    { tableName: "monthly_summary", underscored: true, createdAt: false }
  );

  // 关联关系
  User.hasMany(FinanceRecord, { foreignKey: "user_id" });
  FinanceRecord.belongsTo(User, { foreignKey: "user_id" });

  User.hasMany(UserCategory, { foreignKey: "user_id" });
  UserCategory.belongsTo(User, { foreignKey: "user_id" });

  User.hasMany(MonthlySummary, { foreignKey: "user_id" });
  MonthlySummary.belongsTo(User, { foreignKey: "user_id" });
}

// ===== 初始化 =====

async function initDB() {
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
    pool: { max: 5, min: 0, idle: 10000 },
    define: { charset: "utf8mb4" },
  });

  defineModels(sequelize);

  // 同步表结构（仅创建不存在的表，不修改已有表）
  await sequelize.sync();

  // 为 monthly_summary 添加唯一索引（sync 不会自动创建组合唯一索引）
  const qi = sequelize.getQueryInterface();
  try {
    await qi.addIndex("monthly_summary", ["user_id", "month"], { unique: true, name: "uk_user_month" });
  } catch (_) {
    // 索引已存在，忽略
  }
  try {
    await qi.addIndex("user_categories", ["user_id", "name"], { unique: true, name: "uk_user_cat" });
  } catch (_) {
    // 索引已存在，忽略
  }
  try {
    await qi.addIndex("finance_records", ["user_id", "type", "record_date"], { name: "idx_user_type_date" });
  } catch (_) {}
  try {
    await qi.addIndex("finance_records", ["user_id", "record_date"], { name: "idx_user_date" });
  } catch (_) {}

  console.log("[DB] 数据库初始化完成");
}

function getSequelize() {
  return sequelize;
}

module.exports = {
  initDB,
  getSequelize,
  get User() { return User; },
  get FinanceRecord() { return FinanceRecord; },
  get UserCategory() { return UserCategory; },
  get MonthlySummary() { return MonthlySummary; },
};
