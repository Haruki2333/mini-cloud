(function () {
  var monthInput = document.getElementById("monthInput");
  var searchInput = document.getElementById("searchInput");
  var pageTitle = document.getElementById("pageTitle");
  var listTitle = document.getElementById("listTitle");
  var totalAmountEl = document.getElementById("totalAmount");
  var totalCountEl = document.getElementById("totalCount");
  var recordList = document.getElementById("recordList");

  var TITLES = {
    expense: { page: "EXPENSE_RECORDS", list: "EXPENSE_LOG" },
    income: { page: "INCOME_RECORDS", list: "INCOME_LOG" },
  };

  var type = "";
  var month = "";

  function init() {
    var params = new URLSearchParams(window.location.search);
    type = params.get("type") || "expense";
    month = params.get("month") || new Date().toISOString().slice(0, 7);

    var titles = TITLES[type] || { page: "RECORDS", list: "RECORD_LIST" };
    pageTitle.textContent = titles.page;
    listTitle.textContent = titles.list;
    document.title = (type === "income" ? "收入详情" : "支出详情") + " - 光明财务助理";

    monthInput.value = month;
    monthInput.addEventListener("change", function () {
      month = monthInput.value;
      loadData();
    });

    searchInput.addEventListener("input", function () {
      loadData();
    });

    loadData();
  }

  function loadData() {
    var records = getRecordsByMonth(type, month);
    var keyword = searchInput.value.trim().toLowerCase();

    if (keyword) {
      records = records.filter(function (r) {
        var text = (r.description || "") + (r.category || "") + (r.source || "");
        return text.toLowerCase().indexOf(keyword) !== -1;
      });
    }

    var total = 0;
    for (var i = 0; i < records.length; i++) {
      total += records[i].amount || 0;
    }
    totalAmountEl.textContent = "¥" + total;
    totalCountEl.textContent = records.length + " 条记录";

    renderRecords(records);
  }

  function renderRecords(records) {
    if (records.length === 0) {
      recordList.innerHTML = '<div class="record-empty">&gt; 暂无记录</div>';
      return;
    }

    records.sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });

    var html = "";
    var currentDate = "";

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var dateStr = r.date || "未知日期";

      if (dateStr !== currentDate) {
        currentDate = dateStr;
        html += '<div class="record-date-label">' + escapeHtml(dateStr) + '</div>';
      }

      html += '<div class="record-item">';
      html += '<span class="record-desc">' + escapeHtml(r.description || "") + '</span>';

      if (type === "expense") {
        html += '<span class="record-tag">' + escapeHtml(r.category || "") + '</span>';
      } else if (type === "income") {
        html += '<span class="record-tag">' + escapeHtml(r.source || "") + '</span>';
      }

      html += '<span class="record-amount">¥' + (r.amount || 0) + '</span>';
      html += '</div>';
    }

    recordList.innerHTML = html;
  }

  init();
})();
