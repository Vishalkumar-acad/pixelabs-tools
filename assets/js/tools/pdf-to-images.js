/* ============================================================
   PixelAbs Tools — PDF to Images
   Renders each PDF page to a JPG or PNG. Local by default
   (pdf.js inside the browser); Cloud mode uses our own server.
   ============================================================ */
"use strict";

(function () {

  if (!window.pdfjsLib) { missingLib("pdf.js"); return; }

  /* Point pdf.js at its vendored worker (relative to this page). */
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    new URL("../assets/vendor/pdf.worker.min.js", location.href).toString();

  /* Render scale + JPEG quality per level. Scale is relative to the PDF's
     own points (1.0 is about 72 dpi), so 2.0 is roughly a 150 dpi page. */
  var LEVELS = {
    high:   { scale: 2.0, quality: 0.92 },
    medium: { scale: 1.5, quality: 0.85 },
    low:    { scale: 1.0, quality: 0.72 }
  };

  /* Cap each page's canvas: big scanned pages at full scale can exhaust
     mobile canvas memory and stall the render. */
  var MAX_PAGE_PIXELS = 4000000;

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor"),
    docInfo: document.getElementById("doc-info"),
    proc: document.getElementById("proc"),
    procNote: document.getElementById("proc-note"),
    format: document.getElementById("format"),
    level: document.getElementById("level"),
    pages: document.getElementById("pages"),
    runBtn: document.getElementById("run-btn"),
    clearBtn: document.getElementById("clear-btn"),
    msg: document.getElementById("msg"),
    progressWrap: document.getElementById("progress-wrap"),
    progressBar: document.getElementById("progress-bar"),
    resultsPanel: document.getElementById("results-panel"),
    summary: document.getElementById("summary"),
    results: document.getElementById("results"),
    zipBtn: document.getElementById("zip-btn")
  };

  var state = { file: null, pageCount: 0 };
  var outputs = [];   /* { name, blob } */
  var busy = false;

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = text ? "msg " + (kind || "info") : "msg";
  }

  function updateButtons() {
    els.runBtn.disabled = !state.file || busy;
    els.clearBtn.disabled = !state.file || busy;
  }

  /* ---- Local / Cloud toggle ---- */
  function isCloud() { return els.proc && els.proc.value === "cloud"; }
  function updateProcNote() {
    if (!els.procNote) return;
    els.procNote.textContent = isCloud()
      ? "Cloud mode: your PDF is uploaded to our own processing server, rendered with Ghostscript, and deleted immediately — nothing is stored. If the server is unavailable, the tool falls back to local rendering automatically."
      : "How it works (local): every page is rendered to an image inside your browser — nothing ever leaves your device. Works offline too.";
  }
  if (els.proc) els.proc.addEventListener("change", updateProcNote);
  updateProcNote();

  makeDropzone({
    el: els.dropzone,
    accept: "pdf",
    multiple: false,
    paste: false,
    onFiles: function (list) { load(list[0]); }
  });

  function load(f) {
    if (!f || (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name))) {
      toast("Please choose a PDF file.", "err");
      return;
    }
    readFileAsArrayBuffer(f).then(function (buf) {
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (doc) {
      state.file = f;
      state.pageCount = doc.numPages;
      doc.destroy();
      els.docInfo.innerHTML = "<b>" + escapeHtml(f.name) + "</b> — " + state.pageCount +
        " page" + (state.pageCount === 1 ? "" : "s") + " · " + formatBytes(f.size);
      els.pages.placeholder = "1-" + state.pageCount;
      els.editor.classList.remove("hidden");
      els.resultsPanel.classList.add("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
      updateButtons();
      showMsg("", "");
    }).catch(function (err) {
      toast("Could not read that PDF: " + (err.message || "invalid file"), "err");
    });
  }

  els.clearBtn.addEventListener("click", function () {
    state.file = null;
    outputs = [];
    els.editor.classList.add("hidden");
    els.resultsPanel.classList.add("hidden");
    showMsg("", "");
    updateButtons();
  });

  /* "1-3, 5, 8-10" -> zero-based page indices (same syntax as PDF Split) */
  function parseRange(str, max) {
    var out = [], seen = {};
    var parts = (str || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error("Enter at least one page or range.");
    parts.forEach(function (part) {
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/), a, b;
      if (m) {
        a = parseInt(m[1], 10); b = parseInt(m[2], 10);
        if (a > b) { var t = a; a = b; b = t; }
      } else if (/^\d+$/.test(part)) {
        a = b = parseInt(part, 10);
      } else {
        throw new Error('"' + part + '" is not a valid page or range.');
      }
      if (a < 1 || b > max) throw new Error("Pages must be between 1 and " + max + ".");
      for (var i = a; i <= b; i++) if (!seen[i]) { seen[i] = true; out.push(i - 1); }
    });
    return out;
  }

  function wantedPages() {
    var spec = (els.pages.value || "all").trim();
    if (!spec || spec.toLowerCase() === "all") {
      var all = [];
      for (var i = 0; i < state.pageCount; i++) all.push(i);
      return all;
    }
    return parseRange(spec, state.pageCount);
  }

  /* Reject if a single step never settles (mobile canvas context loss can
     leave a pdf.js render pending forever). */
  function withTimeout(promise, ms, what) {
    return Promise.race([promise, new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(what + " timed out")); }, ms);
    })]);
  }

  function ext() { return els.format.value === "png" ? "png" : "jpg"; }
  function mime() { return ext() === "png" ? "image/png" : "image/jpeg"; }

  async function renderPage(doc, pageNo, level) {
    var page = await doc.getPage(pageNo);
    var base = page.getViewport({ scale: 1 });
    var scale = level.scale;
    var px = base.width * scale * base.height * scale;
    if (px > MAX_PAGE_PIXELS) scale = scale * Math.sqrt(MAX_PAGE_PIXELS / px);
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await withTimeout(page.render({ canvasContext: ctx, viewport: viewport }).promise,
      60000, "page " + pageNo);
    var blob = await new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        if (b) resolve(b); else reject(new Error("page " + pageNo + " could not be encoded"));
      }, mime(), level.quality);
    });
    canvas.width = 0;
    canvas.height = 0;
    try { page.cleanup(); } catch (e) {}
    return blob;
  }

  els.runBtn.addEventListener("click", function () {
    if (!state.file || busy) return;
    if (isCloud()) { cloudRun(); return; }
    localRun();
  });

  function cloudRun() {
    busy = true; updateButtons();
    els.resultsPanel.classList.add("hidden");
    var stop = (window.CloudTools && window.CloudTools.trackProcessing)
      ? window.CloudTools.trackProcessing(showMsg, "your PDF") : null;
    showMsg("Uploading " + state.file.name + "…", "info");
    window.CloudTools.post("/pdf/to-images", {
      file: state.file,
      format: ext(),
      level: els.level.value,
      pages: els.pages.value || "all"
    }, function (pct) {
      showMsg("Uploading " + state.file.name + "… " + pct + "%", "info");
    }, function () {
      if (stop) { stop(); stop = null; }
      showMsg("Cloud server did not respond — retrying once…", "info");
    }).then(function (res) {
      if (stop) stop();
      var blob = new Blob([res.bytes], { type: "application/zip" });
      downloadBlob(blob, baseName(state.file.name) + "-images.zip");
      busy = false; updateButtons();
      showMsg("Done! Rendered on the server and downloaded as a ZIP (" + formatBytes(blob.size) + ").", "ok");
    }).catch(function (err) {
      if (stop) stop();
      var m = String((err && err.message) || err);
      showMsg("Cloud server unavailable (" + m + ") — rendering on your device instead.", "info");
      busy = false;            /* hand over to the local path */
      localRun();
    });
  }

  async function localRun() {
    if (!state.file || busy) return;
    busy = true; updateButtons();
    outputs = [];
    els.resultsPanel.classList.add("hidden");
    els.progressWrap.classList.remove("hidden");
    els.progressBar.style.width = "0%";

    var level = LEVELS[els.level.value] || LEVELS.medium;
    var pages;
    try {
      pages = wantedPages();
    } catch (err) {
      showMsg(err.message, "err");
      els.progressWrap.classList.add("hidden");
      busy = false; updateButtons();
      return;
    }
    if (!pages.length) {
      showMsg("No pages selected.", "err");
      els.progressWrap.classList.add("hidden");
      busy = false; updateButtons();
      return;
    }

    try {
      var buf = await readFileAsArrayBuffer(state.file);
      var doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      for (var k = 0; k < pages.length; k++) {
        var pageNo = pages[k] + 1;
        showMsg("Rendering page " + pageNo + " (" + (k + 1) + " of " + pages.length + ")…", "info");
        var blob = await renderPage(doc, pageNo, level);
        outputs.push({
          name: baseName(state.file.name) + "-page-" + ("00" + pageNo).slice(-3) + "." + ext(),
          blob: blob
        });
        els.progressBar.style.width = Math.round(((k + 1) / pages.length) * 100) + "%";
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      doc.destroy();
      showResults();
    } catch (err) {
      showMsg(err.message || String(err), "err");
    }
    els.progressWrap.classList.add("hidden");
    busy = false;
    updateButtons();
  }

  function showResults() {
    var total = 0;
    outputs.forEach(function (o) { total += o.blob.size; });
    els.summary.innerHTML =
      "<div class='stat'><div class='v'>" + outputs.length + "</div><div class='k'>" +
      (outputs.length === 1 ? "Image" : "Images") + "</div></div>" +
      "<div class='stat good'><div class='v'>" + formatBytes(total) + "</div><div class='k'>Total size</div></div>";

    els.results.innerHTML = "";
    outputs.forEach(function (o, i) {
      var row = document.createElement("div");
      row.className = "file-row done";
      row.innerHTML = "<span class='meta'><span class='name'>" + escapeHtml(o.name) + "</span>" +
        "<span class='size'>" + formatBytes(o.blob.size) + "</span></span>" +
        "<span class='controls'><button title='Download' data-dl='" + i + "'>⬇</button></span>";
      els.results.appendChild(row);
    });
    els.resultsPanel.classList.remove("hidden");
    els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    showMsg("Done! " + outputs.length + " image" + (outputs.length === 1 ? "" : "s") +
      " rendered on your device (" + formatBytes(total) + ").", "ok");
  }

  els.results.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("button[data-dl]") : null;
    if (!btn) return;
    var o = outputs[Number(btn.getAttribute("data-dl"))];
    if (o) downloadBlob(o.blob, o.name);
  });

  els.zipBtn.addEventListener("click", function () {
    if (!outputs.length) return;
    if (typeof JSZip === "undefined") {
      toast("JSZip library not loaded — run bash build.sh (see README).", "err");
      return;
    }
    els.zipBtn.disabled = true;
    showMsg("Building the ZIP…", "info");
    var zip = new JSZip();
    outputs.forEach(function (o) { zip.file(o.name, o.blob); });
    zip.generateAsync({ type: "blob" }).then(function (blob) {
      downloadBlob(blob, baseName(state.file.name) + "-images.zip");
      els.zipBtn.disabled = false;
      showMsg("Done! All " + outputs.length + " images bundled into a ZIP (" + formatBytes(blob.size) + ").", "ok");
    }).catch(function (err) {
      els.zipBtn.disabled = false;
      showMsg("Could not build the ZIP: " + (err.message || err), "err");
    });
  });

})();
