/**
 * 财务助理 — 数据库模型定义
 *
 * 定义 User、FinanceRecord、UserCategory、MonthlySummary 四个模型，
 * 通过 define/afterSync 接口供 core/db.js 的 initDB 调用。
 */

const { DataTypes } = require("sequelize");

let User, FinanceRecord, UserCategory, MonthlySummary;

/**
 * 定义模型和关联关系
 * @param {import("sequelize").Sequelize} sequelize
 */
function define(sequelize) {
  User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      openid: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      anon_token: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      name: { type: DataTypes.STRING(50), defaultValue: "" },
    },
    { tableName: "users", underscored: true }
  );

  FinanceRecord = sequelize.define(
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

  UserCategory = sequelize.define(
    "UserCategory",
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: { type: DataTypes.STRING(20), allowNull: false },
      sort_order: { type: DataTypes.TINYINT.UNSIGNED, defaultValue: 0 },
    },
    { tableName: "user_categories", underscored: true, updatedAt: false }
  );

  MonthlySummary = sequelize.define(
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

/**
 * sync 后创建索引
 * @param {import("sequelize").QueryInterface} qi
 */
async function afterSync(qi) {
  try {
    await qi.addIndex("monthly_summary", ["user_id", "month"], { unique: true, name: "uk_user_month" });
  } catch (_) {}
  try {
    await qi.addIndex("user_categories", ["user_id", "name"], { unique: true, name: "uk_user_cat" });
  } catch (_) {}
  try {
    await qi.addIndex("finance_records", ["user_id", "type", "record_date"], { name: "idx_user_type_date" });
  } catch (_) {}
  try {
    await qi.addIndex("finance_records", ["user_id", "record_date"], { name: "idx_user_date" });
  } catch (_) {}
}

module.exports = {
  define,
  afterSync,
  get User() { return User; },
  get FinanceRecord() { return FinanceRecord; },
  get UserCategory() { return UserCategory; },
  get MonthlySummary() { return MonthlySummary; },
};
