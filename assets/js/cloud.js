/* ============================================================
   PixelAbs Tools — shared cloud (server-side) processing helper.
   Loaded by tools that offer a Local / Cloud toggle. The server
   (Render.com free tier) processes files and deletes them right
   after — nothing is stored.
   ============================================================ */
"use strict";

window.CloudTools = (function () {

  var api = {
    /* Live property — tests (or future code) can override this. */
    URL: "https://pixelabs-api-e0u3.onrender.com"
  };

  /* One POST attempt. fields: plain object of string/number/File. */
  function postOnce(path, fields, onUpload, onUploaded) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      Object.keys(fields).forEach(function (k) {
        if (fields[k] !== undefined && fields[k] !== null) fd.append(k, fields[k]);
      });
      var xhr = new XMLHttpRequest();
      xhr.open("POST", api.URL + path);
      xhr.responseType = "arraybuffer";
      xhr.timeout = 180000;
      if (xhr.upload && onUpload) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) onUpload(Math.round((e.loaded / e.total) * 100));
        };
      }
      if (xhr.upload && onUploaded) {
        xhr.upload.onloadend = function () { onUploaded(); };
      }
      xhr.onload = function () {
        if (xhr.status === 200) {
          resolve({
            bytes: new Uint8Array(xhr.response),
            kept: xhr.getResponseHeader("X-Kept") === "1",
            type: xhr.getResponseHeader("Content-Type")
          });
        } else {
          reject(new Error("server error " + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error("network error")); };
      xhr.ontimeout = function () { reject(new Error("timeout")); };
      xhr.send(fd);
    });
  }

  /* The free server sleeps when idle — a 5xx usually means it is
     waking up, so retry a few times before giving up. */
  function post(path, fields, onUpload, onWake, onUploaded) {
    var attempt = 0;
    function go() {
      attempt++;
      return postOnce(path, fields, onUpload, onUploaded).catch(function (err) {
        var m = String((err && err.message) || err);
        if (attempt < 4 && (m.indexOf("server error 5") === 0 || m.indexOf("network") === 0)) {
          if (onWake) onWake(attempt);
          return new Promise(function (r) { setTimeout(r, 4000); }).then(go);
        }
        throw err;
      });
    }
    return go();
  }

  /* Wrap raw bytes into a Blob and read its pixel dimensions. */
  function toBlob(bytes, mimeType) {
    return new Promise(function (resolve) {
      var blob = new Blob([bytes], { type: mimeType || "image/jpeg" });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { resolve({ blob: blob, w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { resolve({ blob: blob, w: 0, h: 0 }); };
      img.src = url;
    });
  }

  /* Live "Processing..." status while the server works on an uploaded
     file (elapsed seconds + spinner) so a tool never looks stuck.
     showMsg(text, kind) is the tool's own message updater; msgEl
     (optional) receives the spinning-dot animation. Returns stop(). */
  api.trackProcessing = function (showMsg, label, msgEl) {
    var start = Date.now();
    function tick() {
      var s = Math.round((Date.now() - start) / 1000);
      showMsg("Processing " + label + " on the cloud server… " + s + "s", "info");
      if (msgEl) msgEl.classList.add("busy");
    }
    tick();
    var timer = setInterval(tick, 1000);
    return function stop() {
      clearInterval(timer);
      if (msgEl) msgEl.classList.remove("busy");
    };
  };

  api.post = post;
  api.toBlob = toBlob;
  return api;
})();
