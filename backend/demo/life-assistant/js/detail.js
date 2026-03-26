(function () {
  var dateInput = document.getElementById("dateInput");
  var totalExpenseEl = document.getElementById("totalExpense");
  var totalCaloriesEl = document.getElementById("totalCalories");
  var expenseList = document.getElementById("expenseList");
  var foodList = document.getElementById("foodList");

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
    ]).then(function (results) {
      renderSummary(results[0]);
      renderExpenses(results[1].records || []);
      renderFoods(results[2].records || []);
    }).catch(function (err) {
      console.error("加载数据失败:", err);
    });
  }

  function renderSummary(data) {
    if (!data.success) return;
    totalExpenseEl.textContent = "¥" + (data.expense.total || 0);
    totalCaloriesEl.textContent = data.food.totalCalories || 0;
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
      var cal = r.estimated_calories ? "~" + r.estimated_calories + "kcal" : "-";
      html +=
        '<div class="record-item">' +
          '<span class="record-desc">' + escapeHtml(r.food_name) + '</span>' +
          '<span class="record-tag">' + escapeHtml(r.meal_type) + '</span>' +
          '<span class="record-amount">' + cal + '</span>' +
        '</div>';
    }
    foodList.innerHTML = html;
  }

  init();
})();
