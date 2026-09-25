/* Image Converter — batch convert via the compression worker (quality mode) */
"use strict";

(function () {

  var files = [];
  var results = [];
  var uid = 0;

  var MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

  var els = {
    format: document.getElementById("format"),
    quality: document.getElementById("quality"),
    qualityVal: document.getElementById("quality-val"),
    maxDim: document.getElementById("max-dim"),
    convertBtn: document.getElementById("convert-btn"),
    clearBtn: document.getElementById("clear-btn"),
    progressWrap: document.getElementById("progress-wrap"),
    progressBar: document.getElementById("progress-bar"),
    msg: document.getElementById("msg"),
    resultsPanel: document.getElementById("results-panel"),
    results: document.getElementById("results"),
    zipBtn: document.getElementById("zip-btn"),
    optQuality: document.getElementById("opt-quality")
  };

  makeDropzone({
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

  els.format.addEventListener("change", function () {
    els.optQuality.style.visibility = els.format.value === "png" ? "hidden" : "visible";
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
      els.convertBtn.disabled = true;
      els.clearBtn.disabled = true;
      return;
    }
    listEl.classList.remove("hidden");
    els.convertBtn.disabled = false;
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

  els.convertBtn.addEventListener("click", function () {
    if (!files.length) return;
    els.convertBtn.disabled = true;
    els.progressWrap.classList.remove("hidden");
    els.progressBar.style.width = "4%";
    els.resultsPanel.classList.add("hidden");

    var payload = {
      type: "compress-batch",
      mime: MIME[els.format.value],
      quality: parseInt(els.quality.value, 10) / 100,
      maxDim: parseInt(els.maxDim.value, 10) || 0,
      targetBytes: 0,
      files: files.map(function (item) {
        return { file: item.file, name: item.file.name, index: item.id };
      })
    };

    var worker = new Worker("../assets/js/compress-worker.js");
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === "progress") {
        els.progressBar.style.width = Math.round((m.done / m.total) * 100) + "%";
      }
      if (m.type === "done") {
        worker.terminate();
        finish(m.results);
      }
    };
    worker.onerror = function (err) {
      worker.terminate();
      els.convertBtn.disabled = false;
      els.progressWrap.classList.add("hidden");
      showMsg("Conversion failed: " + (err.message || "unknown error"), "err");
    };
    worker.postMessage(payload);
  });

  function finish(res) {
    results = res;
    els.convertBtn.disabled = false;
    els.progressWrap.classList.add("hidden");

    var ok = res.filter(function (r) { return !r.error; });
    if (!ok.length) { showMsg("All conversions failed.", "err"); return; }

    els.results.innerHTML = "";
    ok.forEach(function (r) {
      var ext = EXT[r.blob.type] || "img";
      var row = document.createElement("div");
      row.className = "file-row done";
      var thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = URL.createObjectURL(r.blob);
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = "<div class='name'>" + escapeHtml(baseName(r.name)) + "." + ext + "</div>" +
        "<div class='size'>" + formatBytes(r.originalSize) + " → <b>" + formatBytes(r.size) + "</b> · " +
        r.width + "×" + r.height + "</div>";
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
    showMsg("Converted " + ok.length + " image" + (ok.length > 1 ? "s" : "") + " successfully.", "ok");
  }

  els.zipBtn.addEventListener("click", async function () {
    var ok = results.filter(function (r) { return !r.error; });
    if (!ok.length) return;
    if (typeof JSZip === "undefined") { toast("JSZip library not loaded — run bash build.sh (see README).", "err"); return; }
    var zip = new JSZip();
    ok.forEach(function (r) {
      zip.file(baseName(r.name) + "." + (EXT[r.blob.type] || "img"), r.blob);
    });
    els.zipBtn.disabled = true;
    var blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "converted-images.zip");
    els.zipBtn.disabled = false;
  });

})();
