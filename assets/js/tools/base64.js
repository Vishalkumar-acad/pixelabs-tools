/* Base64 Encoder / Decoder — UTF-8 safe, all local */
"use strict";

(function () {

  var els = {
    plain: document.getElementById("plain"),
    b64: document.getElementById("b64"),
    encodeBtn: document.getElementById("encode-btn"),
    decodeBtn: document.getElementById("decode-btn"),
    swapBtn: document.getElementById("swap-btn"),
    clearBtn: document.getElementById("clear-btn"),
    msg: document.getElementById("msg"),
    fileOutput: document.getElementById("file-output"),
    copyFileBtn: document.getElementById("copy-file-btn"),
    downloadDataBtn: document.getElementById("download-dataurl-btn")
  };

  /* UTF-8 safe helpers (btoa/atob alone mangle non-ASCII characters) */
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  els.encodeBtn.addEventListener("click", function () {
    try {
      els.b64.value = utf8ToB64(els.plain.value);
      showMsg("✓ Encoded " + els.plain.value.length + " characters.", "ok");
    } catch (err) {
      showMsg("Encoding failed: " + err.message, "err");
    }
  });

  els.decodeBtn.addEventListener("click", function () {
    var input = els.b64.value.trim().replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    try {
      els.plain.value = b64ToUtf8(input);
      showMsg("✓ Decoded Base64 (" + input.length + " chars → " + els.plain.value.length + " chars).", "ok");
    } catch (err) {
      showMsg("✗ Invalid Base64 or not valid UTF-8.", "err");
    }
  });

  els.swapBtn.addEventListener("click", function () {
    var t = els.plain.value;
    els.plain.value = els.b64.value;
    els.b64.value = t;
  });

  els.clearBtn.addEventListener("click", function () {
    els.plain.value = "";
    els.b64.value = "";
    showMsg("", "");
  });

  /* ---------- File → Base64 ---------- */

  var current = { name: "", b64: "" };

  makeDropzone({
    el: document.getElementById("file-dropzone"),
    multiple: false,
    paste: false,
    onFiles: function (list) {
      var f = list[0];
      if (!f) return;
      readFileAsDataURL(f).then(function (dataUrl) {
        current.name = f.name;
        current.b64 = dataUrl;
        var raw = dataUrl.slice(dataUrl.indexOf(",") + 1);
        els.fileOutput.textContent = raw;
        els.fileOutput.classList.remove("hidden");
        els.copyFileBtn.classList.remove("hidden");
        els.downloadDataBtn.classList.remove("hidden");
        showMsg("Read " + escapeHtml(f.name) + " (" + formatBytes(f.size) + ") — Base64 length " +
          raw.length.toLocaleString() + " chars.", "ok");
      });
    }
  });

  els.copyFileBtn.addEventListener("click", function () {
    navigator.clipboard.writeText(current.b64).then(function () {
      toast("Base64 (with data URL prefix) copied", "ok");
    });
  });

  els.downloadDataBtn.addEventListener("click", function () {
    downloadBlob(new Blob([current.b64], { type: "text/plain" }), baseName(current.name) + "-base64.txt");
  });

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = text ? "msg " + (kind || "info") : "msg";
  }

})();
