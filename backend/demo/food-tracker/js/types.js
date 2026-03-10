var MODEL_CONFIG = {
  "glm-4v-flash": { label: "GLM-4V-Flash", provider: "zhipu" },
  "glm-4v-flashx": { label: "GLM-4V-FlashX", provider: "zhipu" },
  "qwen3.5-flash": { label: "Qwen3.5-Flash", provider: "qwen" },
};

var DEFAULT_MODEL = "glm-4v-flash";

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
