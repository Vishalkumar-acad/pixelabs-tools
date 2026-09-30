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

/* ---------- Device tier ----------
   On low-memory / few-core devices (typical budget Android phones),
   drop the expensive glass-blur effects by adding .low-power to <html>.
   The design stays the same, the compositing cost disappears. */
(function () {
  try {
    var mem = navigator.deviceMemory || 0;
    var cores = navigator.hardwareConcurrency || 0;
    if ((mem && mem <= 2) || (cores && cores <= 2)) {
      document.documentElement.classList.add("low-power");
    }
  } catch (e) { /* never block the page */ }
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
    var parts = location.pathname.split("/");
    parts.pop();
    var depth = parts.filter(Boolean).length;
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
  var amp = String.fromCharCode(38);
  var map = {};
  map[String.fromCharCode(60)] = amp + "lt;";
  map[String.fromCharCode(62)] = amp + "gt;";
  map[String.fromCharCode(34)] = amp + "quot;";
  map[String.fromCharCode(39)] = amp + "#39;";
  var str = String(s);
  var out = "";
  for (var i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    out += (c === amp) ? amp + "amp;" : (map[c] || c);
  }
  return out;
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
      var acc = String(o.accept).toLowerCase();
      files = files.filter(function (f) {
        return f.type.toLowerCase().indexOf(acc) > -1 || f.name.toLowerCase().indexOf(acc) > -1;
      });
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

/* ---------- Email obfuscation ----------
   Cloudflare's zone-level email obfuscation does not apply to pages
   served by a Worker (this site), so we decode our own: any element
   with data-email holds a hex-encoded address; this swaps in the real
   mailto link. Plain-HTML harvesters only see the encoded form. */
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("[data-email]").forEach(function (el) {
    var hex = el.getAttribute("data-email") || "";
    var addr = "";
    for (var i = 0; i + 1 < hex.length; i += 2) {
      addr += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    if (!addr || addr.indexOf("@") < 0) return;
    el.setAttribute("href", "mailto:" + addr);
    /* only swap the visible label if it is the placeholder form */
    if (el.textContent.indexOf(" [at] ") > -1) el.textContent = addr;
  });
});

/* Footer year + status pill label + legal links */
document.addEventListener("DOMContentLoaded", function () {
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
  document.querySelectorAll(".privacy-pill .label").forEach(function (el) {
    el.textContent = "100% Client-Side Engine Active";
  });

  /* Terms & Privacy links in the slim footer (tool pages). Path-aware
     so the site keeps working when hosted at a sub-path. */
  var slim = document.querySelector(".footer-slim .links");
  if (slim && !slim.querySelector('a[href*="terms.html"]')) {
    var first = slim.querySelector("a");
    var base = first && first.getAttribute("href").indexOf("..") === 0 ? "../" : "";
    var terms = document.createElement("a");
    terms.href = base + "terms.html";
    terms.textContent = "Terms";
    var privacy = document.createElement("a");
    privacy.href = base + "privacy.html";
    privacy.textContent = "Privacy";
    var gh = slim.querySelector('a[href*="github.com"]');
    if (gh) {
      slim.insertBefore(terms, gh);
      slim.insertBefore(privacy, gh);
    } else {
      slim.appendChild(terms);
      slim.appendChild(privacy);
    }
  }

  /* About link in the slim footer — separate check so pages that
     already ship Terms/Privacy statically (terms.html, privacy.html,
     about.html) still get it. */
  /* Cloud status link in the slim footer — same path-aware logic. */
  if (slim && !slim.querySelector('a[href*="status.html"]')) {
    var sfirst = slim.querySelector("a");
    var sbase = sfirst && sfirst.getAttribute("href").indexOf("..") === 0 ? "../" : "";
    var stat = document.createElement("a");
    stat.href = sbase + "status.html";
    stat.textContent = "Cloud status";
    var sterm = slim.querySelector('a[href*="terms.html"]');
    var sgh = slim.querySelector('a[href*="github.com"]');
    if (sterm) slim.insertBefore(stat, sterm);
    else if (sgh) slim.insertBefore(stat, sgh);
    else slim.appendChild(stat);
  }

  if (slim && !slim.querySelector('a[href*="about.html"]')) {
    var afirst = slim.querySelector("a");
    var abase = afirst && afirst.getAttribute("href").indexOf("..") === 0 ? "../" : "";
    var about = document.createElement("a");
    about.href = abase + "about.html";
    about.textContent = "About";
    var agh = slim.querySelector('a[href*="github.com"]');
    var aterm = slim.querySelector('a[href*="terms.html"]');
    if (aterm) slim.insertBefore(about, aterm);
    else if (agh) slim.insertBefore(about, agh);
    else slim.appendChild(about);
  }

  /* homepage Project column: an About link before GitHub */
  var proj = document.querySelector('.footer-col[aria-label="Project"]');
  if (proj && !proj.querySelector('a[href*="about.html"]')) {
    var pul = proj.querySelector("ul");
    var pgh = proj.querySelector('a[href*="github.com"]');
    var pabout = document.createElement("li");
    var pa = document.createElement("a");
    pa.href = "about.html";
    pa.textContent = "About us";
    pabout.appendChild(pa);
    if (pgh && pgh.parentNode && pgh.parentNode.parentNode === pul) {
      pul.insertBefore(pabout, pgh.parentNode);
    } else if (pul) {
      pul.appendChild(pabout);
    }
  }

  /* homepage Project column: a Cloud status link after About us */
  if (proj && !proj.querySelector('a[href*="status.html"]')) {
    var pul2 = proj.querySelector("ul");
    var paboutli = proj.querySelector('a[href*="about.html"]');
    var pstat = document.createElement("li");
    var ps = document.createElement("a");
    ps.href = "status.html";
    ps.textContent = "Cloud status";
    pstat.appendChild(ps);
    if (paboutli && paboutli.parentNode && paboutli.parentNode.parentNode === pul2) {
      pul2.insertBefore(pstat, paboutli.parentNode.nextSibling);
    } else if (pul2) {
      pul2.appendChild(pstat);
    }
  }

  /* PixelAbs services — links to our other products.
     One list to extend when a new service launches. */
  var SERVICES = [
    { name: "PixelAbs Blog", desc: "Share thoughts, publish stories", url: "https://web.pixelabs.in" }
  ];

  /* grid footer (homepage): an "Our services" column after Project */
  var grid = document.querySelector(".footer-grid");
  if (grid && !grid.querySelector(".footer-col.services")) {
    var col = document.createElement("nav");
    col.className = "footer-col services";
    col.setAttribute("aria-label", "PixelAbs services");
    var h4 = document.createElement("h4");
    h4.textContent = "Our services";
    var ul = document.createElement("ul");
    SERVICES.forEach(function (s) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = s.name + " ↗";
      a.title = s.desc;
      li.appendChild(a);
      ul.appendChild(li);
    });
    col.appendChild(h4);
    col.appendChild(ul);
    grid.appendChild(col);
  }

  /* slim footer (tool pages): services links right after "All tools" */
  if (slim && !slim.querySelector('a[href*="web.pixelabs.in"]')) {
    var after = slim.children[1] || null;
    SERVICES.slice().reverse().forEach(function (s) {
      var a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = s.name + " ↗";
      a.title = s.desc;
      slim.insertBefore(a, after);
    });
  }
});

/* ---------- Scroll reveal (elements pop in from below) ----------
   Progressive enhancement: the .reveal class only ever gets added by
   this script, so with JS off every element stays fully visible.
   An element pops when it ENTERS the viewport and re-arms when it has
   fully LEFT it, so it pops again on every later visit too. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  var targets = document.querySelectorAll(
    ".hero, .section-title, .tool-card, .panel, .dropzone, .tool-head, .footer-grid, .footer-slim"
  );
  if (!targets.length) return;

  targets.forEach(function (el) { el.classList.add("reveal"); });

  /* stagger siblings inside a grid so cards arrive in a wave */
  document.querySelectorAll(".tool-grid").forEach(function (grid) {
    grid.querySelectorAll(".tool-card").forEach(function (card, i) {
      card.style.setProperty("--rd", Math.min(i, 9) * 55 + "ms");
    });
  });

  var ioFired = false;
  var io = new IntersectionObserver(function (entries) {
    ioFired = true;
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
      } else {
        /* fully out of view — re-arm so it pops again next time */
        e.target.classList.remove("in");
      }
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });

  targets.forEach(function (el) { io.observe(el); });

  /* safety net — if the observer never fires at all (broken browser),
     show everything rather than leaving the page invisible. It only
     ever runs when the observer is dead: a working observer reveals
     elements exactly when the user scrolls to them, never early. */
  setTimeout(function () {
    if (!ioFired) targets.forEach(function (el) { el.classList.add("in"); });
  }, 2500);
})();
