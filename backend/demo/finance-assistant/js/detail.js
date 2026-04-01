(function () {
  var monthInput = document.getElementById("monthInput");
  var searchInput = document.getElementById("searchInput");
  var pageTitle = document.getElementById("pageTitle");
  var listTitle = document.getElementById("listTitle");
  var totalAmountEl = document.getElementById("totalAmount");
  var totalCountEl = document.getElementById("totalCount");
  var recordList = document.getElementById("recordList");
  var typeTabs = document.getElementById("typeTabs");

  var TITLES = {
    all:     { page: "ALL_RECORDS",     list: "ALL_LOG" },
    expense: { page: "EXPENSE_RECORDS", list: "EXPENSE_LOG" },
    income:  { page: "INCOME_RECORDS",  list: "INCOME_LOG" },
  };

  var type = "";
  var month = "";

  function init() {
    var params = new URLSearchParams(window.location.search);
    type = params.get("type") || "expense";
    month = params.get("month") || new Date().toISOString().slice(0, 7);

    monthInput.value = month;
    monthInput.addEventListener("change", function () {
      month = monthInput.value;
      updateUrl();
      loadData();
    });

    searchInput.addEventListener("input", function () {
      loadData();
    });

    // 类型标签切换
    var tabs = typeTabs.querySelectorAll(".type-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        type = this.getAttribute("data-type");
        updateUrl();
        updateTitles();
        updateActiveTabs();
        loadData();
      });
    }

    updateTitles();
    updateActiveTabs();
    loadData();
  }

  function updateTitles() {
    var titles = TITLES[type] || TITLES.all;
    pageTitle.textContent = titles.page;
    listTitle.textContent = titles.list;
    var docTitles = { all: "收支详情", expense: "支出详情", income: "收入详情" };
    document.title = (docTitles[type] || "收支详情") + " - 光明财务助理";
  }

  function updateActiveTabs() {
    var tabs = typeTabs.querySelectorAll(".type-tab");
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute("data-type") === type) {
        tabs[i].classList.add("active");
      } else {
        tabs[i].classList.remove("active");
      }
    }
  }

  function updateUrl() {
    var url = "detail.html?type=" + type + "&month=" + month;
    history.replaceState(null, "", url);
  }

  function getRecords() {
    if (type === "all") {
      var expenses = getRecordsByMonth("expense", month).map(function (r) {
        return Object.assign({}, r, { _kind: "expense" });
      });
      var incomes = getRecordsByMonth("income", month).map(function (r) {
        return Object.assign({}, r, { _kind: "income" });
      });
      return expenses.concat(incomes);
    }
    return getRecordsByMonth(type, month).map(function (r) {
      return Object.assign({}, r, { _kind: type });
    });
  }

  function loadData() {
    var records = getRecords();
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

      // 分类/来源标签
      var tagText = "";
      if (r._kind === "expense") {
        tagText = r.category || "";
      } else if (r._kind === "income") {
        tagText = r.source || "";
      }
      html += '<span class="record-tag">' + escapeHtml(tagText) + '</span>';

      // 全部模式下加收/支类型标记
      if (type === "all") {
        var kindClass = r._kind === "income" ? "record-kind--income" : "record-kind--expense";
        var kindLabel = r._kind === "income" ? "收" : "支";
        html += '<span class="record-kind ' + kindClass + '">' + kindLabel + '</span>';
      }

      html += '<span class="record-amount">¥' + (r.amount || 0) + '</span>';
      html += '</div>';
    }

    recordList.innerHTML = html;
  }

  init();
})();
