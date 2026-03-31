(function () {
  var dateInput = document.getElementById("dateInput");
  var totalExpenseEl = document.getElementById("totalExpense");
  var totalIncomeEl = document.getElementById("totalIncome");
  var netIncomeEl = document.getElementById("netIncome");
  var expenseList = document.getElementById("expenseList");
  var incomeList = document.getElementById("incomeList");
  var budgetList = document.getElementById("budgetList");

  function init() {
    dateInput.value = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener("change", loadData);
    loadData();
  }

  function loadData() {
    var date = dateInput.value;
    if (!date) return;

    var summary = getRecordsSummary(date);
    var expenses = getRecordsByDate("expense", date);
    var incomes = getRecordsByDate("income", date);
    var budgets = getRecordsByDate("budget", date);

    renderSummary(summary);
    renderExpenses(expenses);
    renderIncomes(incomes);
    renderBudgets(budgets);
  }

  function renderSummary(data) {
    if (!data.success) return;
    totalExpenseEl.textContent = "¥" + (data.expense.total || 0);
    totalIncomeEl.textContent = "¥" + (data.income.total || 0);
    var net = data.netIncome || 0;
    netIncomeEl.textContent = (net >= 0 ? "¥" : "-¥") + Math.abs(net);
  }

  function renderExpenses(records) {
    if (records.length === 0) {
      expenseList.innerHTML = '<div class="record-empty">&gt; 暂无支出记录</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.description) + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.category) + '</span>' +
          '<span class="record-amount">¥' + r.amount + '</span>' +
        '</div>';
    }
    expenseList.innerHTML = html;
  }

  function renderIncomes(records) {
    if (records.length === 0) {
      incomeList.innerHTML = '<div class="record-empty">&gt; 暂无收入记录</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.description) + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.source) + '</span>' +
          '<span class="record-amount">¥' + r.amount + '</span>' +
        '</div>';
    }
    incomeList.innerHTML = html;
  }

  function renderBudgets(records) {
    if (records.length === 0) {
      budgetList.innerHTML = '<div class="record-empty">&gt; 暂无预算记录</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.category) + '</span>' +
          '<span class="record-tag">每' + escapeHtml(r.period) + '</span>' +
          '<span class="record-amount">¥' + r.amount + '</span>' +
        '</div>';
    }
    budgetList.innerHTML = html;
  }

  init();
})();
