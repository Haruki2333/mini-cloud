/**
 * 数据记录查询 API
 */

const express = require("express");
const record = require("../services/skills/record");

const router = express.Router();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/records/expenses?date=YYYY-MM-DD
router.get("/expenses", (req, res) => {
  const date = req.query.date || null;
  const records = record.getRecords("expense", date);
  res.json({ success: true, records });
});

// GET /api/records/foods?date=YYYY-MM-DD
router.get("/foods", (req, res) => {
  const date = req.query.date || null;
  const records = record.getRecords("food", date);
  res.json({ success: true, records });
});

// GET /api/records/todos?date=YYYY-MM-DD
router.get("/todos", (req, res) => {
  const date = req.query.date || null;
  const records = record.getRecords("todo", date);
  res.json({ success: true, records });
});

// GET /api/records/insights?date=YYYY-MM-DD
router.get("/insights", (req, res) => {
  const date = req.query.date || null;
  const records = record.getRecords("insight", date);
  res.json({ success: true, records });
});

// GET /api/records/summary?date=YYYY-MM-DD
router.get("/summary", (req, res) => {
  const date = req.query.date || getToday();
  const expenses = record.getRecords("expense", date);
  const foods = record.getRecords("food", date);
  const todos = record.getRecords("todo", date);
  const insights = record.getRecords("insight", date);

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
