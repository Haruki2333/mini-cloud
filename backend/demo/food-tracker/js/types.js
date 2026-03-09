var TIER_CONFIG = {
  1: { label: "体验版", model: "glm-4v-flash", provider: "zhipu" },
  2: { label: "标准版", model: "gemini-2.0-flash", provider: "gemini" },
  3: { label: "高级版", model: "gpt-4o", provider: "openai" },
};

function escapeHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function formatDate(isoStr) {
  var d = new Date(isoStr);
  var Y = d.getFullYear();
  var M = String(d.getMonth() + 1).padStart(2, "0");
  var D = String(d.getDate()).padStart(2, "0");
  var h = String(d.getHours()).padStart(2, "0");
  var m = String(d.getMinutes()).padStart(2, "0");
  return Y + "-" + M + "-" + D + " " + h + ":" + m;
}
