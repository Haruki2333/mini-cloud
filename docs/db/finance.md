# 财务助理数据库表结构

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `MYSQL_ADDRESS` | MySQL 地址（含端口） | `10.0.0.1:3306` |
| `MYSQL_USERNAME` | 数据库用户名 | `root` |
| `MYSQL_PASSWORD` | 数据库密码 | |
| `MYSQL_DATABASE` | 数据库名（可选，默认 `mini_cloud`） | `mini_cloud` |

## 表结构

### users — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK | 自增主键 |
| openid | VARCHAR(64) UNIQUE | 微信 openid（小程序用户） |
| anon_token | VARCHAR(64) UNIQUE | H5 匿名令牌（UUID） |
| name | VARCHAR(50) | 用户昵称 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

用户通过 `openid`（微信小程序）或 `anon_token`（H5 Demo）标识，二者互斥。

### finance_records — 财务记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK | 自增主键 |
| user_id | INT UNSIGNED FK | 关联 users.id |
| type | ENUM('expense','income','budget') | 记录类型 |
| amount | DECIMAL(12,2) | 金额（元） |
| category | VARCHAR(20) | 分类（expense/budget 用） |
| source | VARCHAR(20) | 收入来源（income 用） |
| description | VARCHAR(200) | 描述 |
| period | ENUM('日','周','月') | 预算周期（budget 用） |
| record_date | DATE | 记录日期 |
| created_at | DATETIME | 创建时间 |

**索引：**
- `idx_user_type_date (user_id, type, record_date)` — 按用户+类型+日期查询
- `idx_user_date (user_id, record_date)` — 按用户+日期查询

三种记录类型合一张表，便于 LLM 一条查询获取用户财务全貌。

### user_categories — 用户自定义分类表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK | 自增主键 |
| user_id | INT UNSIGNED FK | 关联 users.id |
| name | VARCHAR(20) | 分类名称 |
| sort_order | TINYINT UNSIGNED | 排序序号 |
| created_at | DATETIME | 创建时间 |

**唯一约束：** `uk_user_cat (user_id, name)`

### monthly_summary — 月度汇总表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT UNSIGNED PK | 自增主键 |
| user_id | INT UNSIGNED FK | 关联 users.id |
| month | CHAR(7) | 月份（YYYY-MM） |
| total_expense | DECIMAL(12,2) | 月总支出 |
| total_income | DECIMAL(12,2) | 月总收入 |
| net_income | DECIMAL(12,2) | 月净收支 |
| expense_by_category | JSON | 按分类汇总支出 |
| income_by_source | JSON | 按来源汇总收入 |
| record_count | INT UNSIGNED | 记录条数 |
| updated_at | DATETIME | 更新时间 |

**唯一约束：** `uk_user_month (user_id, month)`

预计算汇总表，每次插入/删除记录后自动刷新。为 LLM 趋势分析优化 — 查询最近 N 个月趋势只需读取 N 行数据。

## 初始化

服务启动时自动调用 `initDB()`，依次执行：
1. `CREATE DATABASE IF NOT EXISTS mini_cloud` — 确保数据库存在
2. `sequelize.sync()` — 自动创建不存在的表
3. 补建组合索引和唯一约束
