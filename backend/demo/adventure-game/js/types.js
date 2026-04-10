var MODEL_CONFIG = {
  "qwen3.5-plus": { label: "Qwen3.5-Plus", provider: "qwen" },
  "glm-4.6v": { label: "GLM-4.6V", provider: "zhipu" },
};

var DEFAULT_MODEL = "qwen3.5-plus";
var API_BASE = "/api/adventure";
var MAX_STORIES = 20;

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

function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0;
    var v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
