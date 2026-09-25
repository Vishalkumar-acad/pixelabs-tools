/* ============================================================
   PixelAbs Tools — shared runtime (theme, dropzone, helpers)
   ============================================================ */
"use strict";

/* ---------- Theme ---------- */
(function initTheme() {
  const stored = localStorage.getItem("pat-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (stored === "dark" || (!stored && prefersDark)) document.documentElement.classList.add("dark");
})();

function toggleTheme() {
  const root = document.documentElement;
  const dark = root.classList.toggle("dark");
  localStorage.setItem("pat-theme", dark ? "dark" : "light");
}

/* ---------- Service worker (PWA / offline) ----------
   Registered with a RELATIVE path computed from the current page, so it
   works at any host or sub-path:
     "/"                     -> "./sw.js"
     "/tools/x.html"         -> "../sw.js"
     "/repo/tools/x.html"   -> "../../sw.js"  (e.g. GitHub Pages project sites)
---------------------------------------------------------------- */
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", function () {
    var dir = location.pathname.replace(/\ /[^/]*$/, "/");
    var depth = dir.split("/").filter(Boolean).length;
    var swUrl = (depth ? new Array(depth + 1).join("../") : "./") + "sw.js";
    navigator.serviceWorker.register(swUrl).catch(function () { /* offline mode optional */ });
  });

  /* When a NEW service worker version takes control of this page, reload
     once so the user gets the fresh assets immediately (cache-busting).
     Skipped on first-ever registration (no previous controller). */
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (!hadController) return;
    if (window.__patSwRefreshed) return;
    window.__patSwRefreshed = true;
    window.location.reload();
  });

  /* Back/forward cache (bfcache): when the page is restored from the
     navigation cache, refresh anything that may have gone stale. */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && typeof Savings !== "undefined" && Savings.render) {
      Savings.render();
    }
  });
}

/* ---------- Anonymous error reporting ----------
   The ONLY thing this site ever sends home: an error message,
   the page path, and a timestamp. No user identifiers, no
   cookies, no file content. Queued locally and flushed when
   online — so even failures on a dead network are captured. */
(function () {
  var KEY = "pat-errq";
  var MAX_QUEUE = 20;
  var captured = 0;

  function record(msg) {
    if (captured >= 5) return; /* max 5 errors per page view */
    captured++;
    try {
      var q = JSON.parse(localStorage.getItem(KEY) || "[]");
      q.push({ m: String(msg).slice(0, 200), u: location.pathname, t: Date.now() });
      if (q.length > MAX_QUEUE) q = q.slice(-MAX_QUEUE);
      localStorage.setItem(KEY, JSON.stringify(q));
    } catch (e) { /* private mode — drop silently */ }
  }

  window.addEventListener("error", function (ev) {
    record(ev.message || "unknown error");
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    record((r && r.message) || "unhandled rejection");
  });

  function flush() {
    try {
      var q = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!q.length) return;
      if (navigator.sendBeacon && navigator.sendBeacon("/__log", JSON.stringify(q))) {
        localStorage.setItem(KEY, "[]");
      }
    } catch (e) { /* never block the page */ }
  }

  window.addEventListener("load", function () { setTimeout(flush, 2500); });
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", flush);
})();

/* ---------- Utilities ---------- */

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  if (!bytes && bytes !== 0) return "—";
  var units = ["B", "KB", "MB", "GB"];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i >= units.length) i = units.length - 1;
  var v = bytes / Math.pow(1024, i);
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + " " + units[i];
}

function escapeHtml(s) {
  return String(s).replace(/[<>"']/g, function (c) {
    return "&#".concat(c.charCodeAt(0), ";");
  });
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function baseName(name) {
  var i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/* ---------- Toast ---------- */

function toast(message, type) {
  var root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  var el = document.createElement("div");
  el.className = "toast " + (type || "");
  el.textContent = message;
  root.appendChild(el);
  setTimeout(function () { el.remove(); }, 3200);
}

/* ---------- Savings tracker (local only) ---------- */

var Savings = {
  add: function (bytesSaved) {
    try {
      var cur = parseInt(localStorage.getItem("pat-saved") || "0", 10) || 0;
      cur += Math.max(0, Math.round(bytesSaved));
      localStorage.setItem("pat-saved", String(cur));
      Savings.render();
    } catch (e) { /* private mode */ }
  },
  total: function () {
    return parseInt(localStorage.getItem("pat-saved") || "0", 10) || 0;
  },
  render: function () {
    var el = document.getElementById("savings-note");
    if (!el) return;
    var total = Savings.total();
    if (total > 0) el.textContent = "You have saved " + formatBytes(total) + " so far using these tools.";
  }
};

document.addEventListener("DOMContentLoaded", Savings.render);

/* ---------- Dropzone factory ----------
   makeDropzone({
     el, accept, multiple, onFiles
   })
------------------------------------------------ */

function makeDropzone(opts) {
  var el = opts.el;
  var input = el.querySelector("input[type=file]");

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!opts.multiple) files = files.slice(0, 1);
    if (files.length) opts.onFiles(files);
  }

  el.addEventListener("click", function (e) {
    if (e.target === input) return;
    input.click();
  });
  input.addEventListener("change", function () {
    handleFiles(input.files);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    el.addEventListener(ev, function (e) { e.preventDefault(); el.classList.remove("dragover"); });
  });
  el.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });

  /* Paste support: Ctrl+V images from clipboard */
  if (opts.paste !== false) {
    document.addEventListener("paste", function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "file") return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          var f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        handleDropFilters(files, opts);
      }
    });
  }

  function handleDropFilters(files, o) {
    if (o.accept) {
      var ok = new RegExp(o.accept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      files = files.filter(function (f) { return ok.test(f.type) || ok.test(f.name); });
    }
    if (files.length) o.onFiles(o.multiple ? files : files.slice(0, 1));
  }

  return { input: input };
}

/* ---------- Misc helpers ---------- */

/* Friendly banner when a vendored library has not been fetched yet */
function missingLib(libName) {
  var head = document.querySelector(".tool-head") || document.body;
  head.insertAdjacentHTML("afterend",
    "<div class='panel msg err' style='display:block'>⚠️ The <b>" + libName +
    "</b> library is not loaded. Run <code>bash build.sh</code> once (see README) " +
    "to download the vendored libraries, then reload this page.</div>");
}

function readFileAsArrayBuffer(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(new Error("Could not read " + file.name)); };
    r.readAsArrayBuffer(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(new Error("Could not read " + file.name)); };
    r.readAsDataURL(file);
  });
}

/* Footer year + status pill label */
document.addEventListener("DOMContentLoaded", function () {
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
  document.querySelectorAll(".privacy-pill .label").forEach(function (el) {
    el.textContent = "100% Client-Side Engine Active";
  });
});
