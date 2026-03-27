/**
 * 数据记录查询 API
 * 暴露 expense 和 food-log 的查询接口
 */

const express = require("express");
const expense = require("../services/skills/expense");
const foodLog = require("../services/skills/food-log");
const todo = require("../services/skills/todo");
const insight = require("../services/skills/insight");

const router = express.Router();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/records/expenses?date=YYYY-MM-DD
router.get("/expenses", (req, res) => {
  const date = req.query.date || null;
  const records = expense.getRecords(date);
  res.json({ success: true, records });
});

// GET /api/records/foods?date=YYYY-MM-DD
router.get("/foods", (req, res) => {
  const date = req.query.date || null;
  const records = foodLog.getRecords(date);
  res.json({ success: true, records });
});

// GET /api/records/todos?date=YYYY-MM-DD
router.get("/todos", (req, res) => {
  const date = req.query.date || null;
  const records = todo.getRecords(date);
  res.json({ success: true, records });
});

// GET /api/records/insights?date=YYYY-MM-DD
router.get("/insights", (req, res) => {
  const date = req.query.date || null;
  const records = insight.getRecords(date);
  res.json({ success: true, records });
});

// GET /api/records/summary?date=YYYY-MM-DD
router.get("/summary", (req, res) => {
  const date = req.query.date || getToday();
  const expenses = expense.getRecords(date);
  const foods = foodLog.getRecords(date);
  const todos = todo.getRecords(date);
  const insights = insight.getRecords(date);

  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const expenseByCategory = {};
  expenses.forEach((r) => {
    expenseByCategory[r.category] =
      (expenseByCategory[r.category] || 0) + r.amount;
  });

  res.json({
    success: true,
    date,
    expense: {
      total: totalExpense,
      count: expenses.length,
      byCategory: expenseByCategory,
    },
    food: { count: foods.length },
    todo: { count: todos.length },
    insight: { count: insights.length },
  });
});

module.exports = router;
