/* PDF Split & Extract — extract page ranges or split into single pages */
"use strict";

(function () {

  if (typeof PDFLib === "undefined") { missingLib("pdf-lib"); return; }
  var { PDFDocument } = PDFLib;

  var state = { file: null, pageCount: 0 };

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor"),
    docInfo: document.getElementById("doc-info"),
    mode: document.getElementById("mode"),
    rangeWrap: document.getElementById("range-wrap"),
    range: document.getElementById("range"),
    runBtn: document.getElementById("run-btn"),
    clearBtn: document.getElementById("clear-btn"),
    msg: document.getElementById("msg")
  };

  makeDropzone({
    el: els.dropzone,
    accept: "pdf",
    multiple: false,
    paste: false,
    onFiles: function (list) { load(list[0]); }
  });

  /* ---- Local / Cloud toggle ---- */
  var procEl = document.getElementById("proc");
  var procNote = document.getElementById("proc-note");
  function isCloud() { return procEl && procEl.value === "cloud"; }
  function updateProcNote() {
    if (!procNote) return;
    procNote.textContent = isCloud()
      ? "Cloud mode: the file is uploaded to our free processing server (Render), processed, and deleted immediately — nothing is stored. If the server is busy, the tool falls back to local processing automatically."
      : "How it works (local): everything runs on your device — nothing ever leaves it. Works offline too.";
  }
  if (procEl) procEl.addEventListener("change", updateProcNote);
  updateProcNote();


  els.mode.addEventListener("change", function () {
    var extract = els.mode.value === "extract";
    els.rangeWrap.style.visibility = extract ? "visible" : "hidden";
  });

  function load(file) {
    if (!file || (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name))) {
      toast("Please choose a PDF file.", "err");
      return;
    }
    readFileAsArrayBuffer(file).then(async function (buf) {
      var doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      state.file = file;
      state.pageCount = doc.getPageCount();
      els.docInfo.innerHTML = "<b>" + escapeHtml(file.name) + "</b> — " + state.pageCount +
        " page" + (state.pageCount === 1 ? "" : "s") + " · " + formatBytes(file.size);
      els.range.placeholder = "1-" + state.pageCount;
      els.editor.classList.remove("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("", "");
    }).catch(function (err) {
      toast("Could not read that PDF: " + (err.message || "invalid file"), "err");
    });
  }

  els.clearBtn.addEventListener("click", function () {
    state.file = null;
    els.editor.classList.add("hidden");
    els.msg.className = "msg";
  });

  /* Parse "1-3, 5, 8-10" into zero-based page indices, with validation */
  function parseRange(str, max) {
    var out = [];
    var seen = {};
    var parts = str.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) throw new Error("Enter at least one page or range.");
    parts.forEach(function (part) {
      var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
      var a, b;
      if (m) {
        a = parseInt(m[1], 10); b = parseInt(m[2], 10);
        if (a > b) { var t = a; a = b; b = t; }
      } else if (/^\d+$/.test(part)) {
        a = b = parseInt(part, 10);
      } else {
        throw new Error('"' + part + '" is not a valid page or range.');
      }
      if (a < 1 || b > max) throw new Error("Pages must be between 1 and " + max + ".");
      for (var i = a; i <= b; i++) {
        if (!seen[i]) { seen[i] = true; out.push(i - 1); }
      }
    });
    return out;
  }

  els.runBtn.addEventListener("click", async function () {
    if (!state.file) return;
    if (isCloud() && els.mode.value === "extract") { cloudExtract(); return; }
    localRun();
  });

  function cloudExtract() {
    els.runBtn.disabled = true;
    var stop = CloudTools.trackProcessing(showMsg, "your PDF");
    CloudTools.post("/pdf/split", {
      file: state.file, pages: els.range.value || "all"
    }, function (pct) { showMsg("Uploading… " + pct + "%", "info"); }).then(function (res) {
      stop();
      var blob = new Blob([res.bytes], { type: "application/pdf" });
      downloadBlob(blob, baseName(state.file.name) + "-extract.pdf");
      showMsg("Done! Extracted on the server (" + formatBytes(blob.size) + ").", "ok");
      els.runBtn.disabled = false;
    }).catch(function () {
      stop();
      showMsg("Cloud extraction failed — falling back to local processing.", "err");
      localRun();
    });
  }

  async function localRun() {
    if (!state.file) return;
    els.runBtn.disabled = true;

    try {
      var buf = await readFileAsArrayBuffer(state.file);
      var src = await PDFDocument.load(buf, { ignoreEncryption: true });

      if (els.mode.value === "extract") {
        var indices = parseRange(els.range.value, state.pageCount);
        var out = await PDFDocument.create();
        var pages = await out.copyPages(src, indices);
        pages.forEach(function (p) { out.addPage(p); });
        var bytes = await out.save();
        var blob = new Blob([bytes], { type: "application/pdf" });
        downloadBlob(blob, baseName(state.file.name) + "-extract.pdf");
        showMsg("Done! Extracted " + indices.length + " page" + (indices.length === 1 ? "" : "s") +
          " (" + formatBytes(blob.size) + ").", "ok");
      } else {
        showMsg("Splitting " + state.pageCount + " pages…", "info");
        if (typeof JSZip === "undefined") { toast("JSZip library not loaded — run bash build.sh (see README).", "err"); return; }
        var zip = new JSZip();
        for (var i = 0; i < state.pageCount; i++) {
          var one = await PDFDocument.create();
          var p = await one.copyPages(src, [i]);
          one.addPage(p[0]);
          var b = await one.save();
          zip.file(baseName(state.file.name) + "-page-" + (i + 1) + ".pdf", b);
        }
        var zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, baseName(state.file.name) + "-split.zip");
        showMsg("Done! " + state.pageCount + " single-page PDFs bundled into a ZIP (" + formatBytes(zipBlob.size) + ").", "ok");
      }
    } catch (err) {
      showMsg(err.message || String(err), "err");
    }
    els.runBtn.disabled = false;
  }

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = text ? "msg " + (kind || "info") : "msg";
  }

})();
