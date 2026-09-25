/* Image Compressor — main-thread controller for the compression worker */
"use strict";

(function () {

  var files = [];          /* { file, id } */
  var results = [];
  var uid = 0;

  var dropzone = makeDropzone({
    el: document.getElementById("dropzone"),
    accept: "image/",
    multiple: true,
    onFiles: function (list) {
      list.forEach(function (f) {
        if (/^image\//.test(f.type)) files.push({ file: f, id: ++uid });
      });
      renderFiles();
    }
  });

  var els = {
    mode: document.getElementById("mode"),
    targetOpt: document.getElementById("opt-target"),
    qualityOpt: document.getElementById("opt-quality"),
    qualityVal: document.getElementById("quality-val"),
    quality: document.getElementById("quality"),
    compressBtn: document.getElementById("compress-btn"),
    clearBtn: document.getElementById("clear-btn"),
    fileList: document.getElementById("dropzone").parentElement,
    progressWrap: document.getElementById("progress-wrap"),
    progressBar: document.getElementById("progress-bar"),
    msg: document.getElementById("msg"),
    resultsPanel: document.getElementById("results-panel"),
    results: document.getElementById("results"),
    summary: document.getElementById("summary"),
    zipBtn: document.getElementById("zip-btn"),
    format: document.getElementById("format"),
    targetKb: document.getElementById("target-kb"),
    targetUnit: document.getElementById("target-unit"),
    maxDim: document.getElementById("max-dim")
  };

  els.mode.addEventListener("change", function () {
    var target = els.mode.value === "target";
    els.targetOpt.classList.toggle("hidden", !target);
    els.qualityOpt.classList.toggle("hidden", target);
  });

  els.quality.addEventListener("input", function () {
    els.qualityVal.textContent = els.quality.value + "%";
  });

  els.clearBtn.addEventListener("click", function () {
    files = [];
    results = [];
    renderFiles();
    els.resultsPanel.classList.add("hidden");
    els.msg.className = "msg";
  });

  function renderFiles() {
    var listEl = document.getElementById("file-list");
    if (!listEl) {
      listEl = document.createElement("div");
      listEl.id = "file-list";
      listEl.className = "file-list mt hidden";
      document.getElementById("dropzone").insertAdjacentElement("afterend", listEl);
    }
    if (!files.length) {
      listEl.classList.add("hidden");
      els.compressBtn.disabled = true;
      els.clearBtn.disabled = true;
      return;
    }
    listEl.classList.remove("hidden");
    els.compressBtn.disabled = false;
    els.clearBtn.disabled = false;
    listEl.innerHTML = "";
    files.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "file-row";
      var thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = URL.createObjectURL(item.file);
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = "<div class='name'>" + escapeHtml(item.file.name) + "</div>" +
        "<div class='size'>" + formatBytes(item.file.size) + "</div>";
      var controls = document.createElement("div");
      controls.className = "controls";
      var del = document.createElement("button");
      del.title = "Remove";
      del.textContent = "✕";
      del.addEventListener("click", function () {
        files = files.filter(function (x) { return x.id !== item.id; });
        renderFiles();
      });
      controls.appendChild(del);
      row.append(thumb, meta, controls);
      listEl.appendChild(row);
    });
  }

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  els.compressBtn.addEventListener("click", run);
  function run() {
    if (!files.length) return;
    if (!("Worker" in window)) {
      showMsg("Your browser does not support Web Workers — compression will run on the main thread and may briefly freeze the page.", "info");
    }

    els.compressBtn.disabled = true;
    els.progressWrap.classList.remove("hidden");
    els.progressBar.style.width = "4%";
    els.resultsPanel.classList.add("hidden");

    var mode = els.mode.value;
    var payload = {
      type: "compress-batch",
      mime: { jpeg: "image/jpeg", webp: "image/webp" }[els.format.value],
      quality: parseInt(els.quality.value, 10) / 100,
      maxDim: parseInt(els.maxDim.value, 10) || 0,
      targetBytes: 0,
      files: files.map(function (item) {
        return { file: item.file, name: item.file.name, index: item.id };
      })
    };
    if (mode === "target") {
      var amount = parseFloat(els.targetKb.value);
      if (!amount || amount <= 0) { showMsg("Enter a valid target size.", "err"); els.compressBtn.disabled = false; return; }
      payload.targetBytes = Math.round(amount * parseInt(els.targetUnit.value, 10));
    }

    var worker = new Worker("../assets/js/compress-worker.js");
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === "progress") {
        els.progressBar.style.width = Math.round((m.done / m.total) * 100) + "%";
      }
      if (m.type === "done") {
        worker.terminate();
        finish(m.results, m.totalSaved);
      }
    };
    worker.onerror = function (err) {
      worker.terminate();
      els.compressBtn.disabled = false;
      els.progressWrap.classList.add("hidden");
      showMsg("Compression failed: " + (err.message || "unknown error"), "err");
    };
    worker.postMessage(payload);
  }

  function finish(res, totalSaved) {
    results = res;
    els.compressBtn.disabled = false;
    els.progressWrap.classList.add("hidden");
    var ok = res.filter(function (r) { return !r.error; });
    var failed = res.length - ok.length;

    if (!ok.length) {
      showMsg("All files failed to compress.", "err");
      return;
    }

    if (totalSaved > 0) Savings.add(totalSaved);

    var totalBefore = ok.reduce(function (a, r) { return a + r.originalSize; }, 0);
    var totalAfter = ok.reduce(function (a, r) { return a + r.size; }, 0);

    els.summary.innerHTML =
      stat(formatBytes(totalBefore), "Before") +
      stat(formatBytes(totalAfter), "After") +
      stat("−" + formatBytes(Math.max(0, totalBefore - totalAfter)), "Total saved", true) +
      stat(ok.length + (failed ? " <span style='color:var(--danger)'>(" + failed + " failed)</span>" : ""), "Images");

    els.results.innerHTML = "";
    ok.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "file-row done";
      var thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = URL.createObjectURL(r.blob);
      var meta = document.createElement("div");
      meta.className = "meta";
      var ext = r.blob.type === "image/webp" ? "webp" : "jpg";
      var pct = r.originalSize ? Math.round(100 - (r.size / r.originalSize) * 100) : 0;
      meta.innerHTML =
        "<div class='name'>" + escapeHtml(baseName(r.name)) + "." + ext + "</div>" +
        "<div class='size'>" + formatBytes(r.originalSize) + " → <b>" + formatBytes(r.size) + "</b>" +
        (pct > 0 ? " <span class='delta-good'>−" + pct + "%</span>" : "") +
        " · " + r.width + "×" + r.height + "</div>";
      var dl = document.createElement("button");
      dl.className = "btn btn-secondary btn-sm";
      dl.textContent = "Download";
      dl.addEventListener("click", function () {
        downloadBlob(r.blob, baseName(r.name) + "." + ext);
      });
      row.append(thumb, meta, dl);
      els.results.appendChild(row);
    });

    els.resultsPanel.classList.remove("hidden");
    els.zipBtn.style.display = ok.length > 1 ? "" : "none";
    showMsg("Done! " + ok.length + " image" + (ok.length > 1 ? "s" : "") + " compressed. " +
      (failed ? failed + " file(s) could not be processed." : ""), failed ? "info" : "ok");
    els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stat(v, k, good) {
    return "<div class='stat" + (good ? " good" : "") + "'><div class='v'>" + v + "</div><div class='k'>" + k + "</div></div>";
  }

  els.zipBtn.addEventListener("click", async function () {
    var ok = results.filter(function (r) { return !r.error; });
    if (!ok.length) return;
    if (typeof JSZip === "undefined") { toast("JSZip library not loaded — run bash build.sh (see README).", "err"); return; }
    var zip = new JSZip();
    ok.forEach(function (r) {
      var ext = r.blob.type === "image/webp" ? "webp" : "jpg";
      zip.file(baseName(r.name) + "." + ext, r.blob);
    });
    els.zipBtn.disabled = true;
    var blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "compressed-images.zip");
    els.zipBtn.disabled = false;
  });

})();
