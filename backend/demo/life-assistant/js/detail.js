(function () {
  var dateInput = document.getElementById("dateInput");
  var totalExpenseEl = document.getElementById("totalExpense");
  var totalFoodEl = document.getElementById("totalFood");
  var totalTodoEl = document.getElementById("totalTodo");
  var totalInsightEl = document.getElementById("totalInsight");
  var expenseList = document.getElementById("expenseList");
  var foodList = document.getElementById("foodList");
  var todoList = document.getElementById("todoList");
  var insightList = document.getElementById("insightList");

  function init() {
    // 默认今天
    dateInput.value = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener("change", loadData);
    loadData();
  }

  function loadData() {
    var date = dateInput.value;
    if (!date) return;

    Promise.all([
      fetch("/api/records/summary?date=" + date).then(function (r) { return r.json(); }),
      fetch("/api/records/expenses?date=" + date).then(function (r) { return r.json(); }),
      fetch("/api/records/foods?date=" + date).then(function (r) { return r.json(); }),
      fetch("/api/records/todos?date=" + date).then(function (r) { return r.json(); }),
      fetch("/api/records/insights?date=" + date).then(function (r) { return r.json(); }),
    ]).then(function (results) {
      renderSummary(results[0]);
      renderExpenses(results[1].records || []);
      renderFoods(results[2].records || []);
      renderTodos(results[3].records || []);
      renderInsights(results[4].records || []);
    }).catch(function (err) {
      console.error("加载数据失败:", err);
    });
  }

  function renderSummary(data) {
    if (!data.success) return;
    totalExpenseEl.textContent = "¥" + (data.expense.total || 0);
    totalFoodEl.textContent = data.food.count || 0;
    totalTodoEl.textContent = data.todo.count || 0;
    totalInsightEl.textContent = data.insight.count || 0;
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

  function renderFoods(records) {
    if (records.length === 0) {
      foodList.innerHTML = '<div class="record-empty">&gt; 暂无食物记录</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.food_name) + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.meal_type) + '</span>' +
        '</div>';
    }
    foodList.innerHTML = html;
  }

  function renderTodos(records) {
    if (records.length === 0) {
      todoList.innerHTML = '<div class="record-empty">&gt; 暂无待办事项</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.title) + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.priority) + '</span>' +
        '</div>';
    }
    todoList.innerHTML = html;
  }

  function renderInsights(records) {
    if (records.length === 0) {
      insightList.innerHTML = '<div class="record-empty">&gt; 暂无感悟记录</div>';
      return;
    }

    var html = "";
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var tagHtml = r.tag ? '<span class="record-tag">' + escapeHtml(r.tag) + '</span>' : '';
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.content) + '</span>' +
          tagHtml +
        '</div>';
    }
    insightList.innerHTML = html;
  }

  init();
})();
