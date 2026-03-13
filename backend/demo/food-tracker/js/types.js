var MODEL_CONFIG = {
  "glm-4.6v": { label: "GLM-4.6V", provider: "zhipu" },
  "qwen3.5-plus": { label: "Qwen3.5-Plus", provider: "qwen" },
};

var DEFAULT_MODEL = "glm-4.6v";

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

// GPS 度分秒转十进制
function dmsToDecimal(dms, ref) {
  var d = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (ref === "S" || ref === "W") d = -d;
  return Math.round(d * 1000000) / 1000000;
}

// 从文件中提取 EXIF 数据（拍摄时间 + GPS）
function extractExifData(file, callback) {
  if (typeof EXIF === "undefined") {
    callback({ photoTime: null, lat: null, lng: null });
    return;
  }
  EXIF.getData(file, function () {
    var dateTime = EXIF.getTag(this, "DateTimeOriginal");
    var lat = EXIF.getTag(this, "GPSLatitude");
    var latRef = EXIF.getTag(this, "GPSLatitudeRef");
    var lng = EXIF.getTag(this, "GPSLongitude");
    var lngRef = EXIF.getTag(this, "GPSLongitudeRef");

    var result = { photoTime: null, lat: null, lng: null };

    if (dateTime) {
      // "2026:03:12 12:30:00" → "2026-03-12 12:30:00"
      result.photoTime = dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    }

    if (lat && lng) {
      result.lat = dmsToDecimal(lat, latRef);
      result.lng = dmsToDecimal(lng, lngRef);
    }

    callback(result);
  });
}

// 浏览器 Geolocation 兜底获取位置
function getBrowserLocation(callback) {
  if (!navigator.geolocation) {
    callback(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      callback({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    function () {
      callback(null);
    },
    { timeout: 5000, maximumAge: 60000 }
  );
}

// 反向地理编码
function reverseGeocode(lat, lng, callback) {
  fetch("/api/geocode/reverse?lat=" + lat + "&lng=" + lng)
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      callback(data.address || null);
    })
    .catch(function () {
      callback(null);
    });
}

// 获取照片元数据（EXIF 优先 + Geolocation 兜底 + 反向编码），返回 { photoTime, location }
function getPhotoMeta(file, callback) {
  extractExifData(file, function (exif) {
    var photoTime = exif.photoTime || new Date().toISOString();

    if (exif.lat != null && exif.lng != null) {
      reverseGeocode(exif.lat, exif.lng, function (address) {
        callback({
          photoTime: photoTime,
          location: { lat: exif.lat, lng: exif.lng, address: address || "" },
        });
      });
    } else {
      getBrowserLocation(function (pos) {
        if (pos) {
          reverseGeocode(pos.lat, pos.lng, function (address) {
            callback({
              photoTime: photoTime,
              location: { lat: pos.lat, lng: pos.lng, address: address || "" },
            });
          });
        } else {
          callback({ photoTime: photoTime, location: null });
        }
      });
    }
  });
}
