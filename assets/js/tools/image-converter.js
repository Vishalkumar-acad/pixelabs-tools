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
    optQuality: document.getElementById("opt-quality"),
    proc: document.getElementById("proc"),
    procNote: document.getElementById("proc-note")
  };

  makeDropzone({
    el: document.getElementById("dropzone"),
    accept: "image/",
    multiple: true,
    onFiles: function (list) {
      list.forEach(function (f) {
        if (f.type.indexOf("image/") === 0 || f.type === "") files.push({ file: f, id: ++uid });
      });
      renderFiles();
    }
  });

  els.format.addEventListener("change", function () {
    els.optQuality.style.visibility = els.format.value === "png" ? "hidden" : "visible";
  });

  function updateProcNote() {
    if (!els.procNote) return;
    if (els.proc.value === "cloud") {
      els.procNote.textContent = "Cloud mode: images are uploaded to our free processing server (Render), converted, and deleted immediately — nothing is stored. Bonus: HEIC (iPhone) photos work in the cloud even though browsers cannot open them. If the server is busy, the tool falls back to local processing automatically.";
    } else {
      els.procNote.textContent = "How it works (local): conversion runs entirely on your device — nothing ever leaves it. Works offline too.";
    }
  }
  if (els.proc) els.proc.addEventListener("change", updateProcNote);
  updateProcNote();

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
    if (els.proc.value === "cloud") { runCloud(); return; }
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

  /* Run a local worker batch for a subset of files (cloud fallback). */
  function runLocalBatch(indices) {
    return new Promise(function (resolve) {
      var payload = {
        type: "compress-batch",
        mime: MIME[els.format.value],
        quality: parseInt(els.quality.value, 10) / 100,
        maxDim: parseInt(els.maxDim.value, 10) || 0,
        targetBytes: 0,
        files: indices.map(function (i) {
          return { file: files[i].file, name: files[i].file.name, index: files[i].id };
        })
      };
      var worker = new Worker("../assets/js/compress-worker.js");
      worker.onmessage = function (e) {
        if (e.data.type === "done") { worker.terminate(); resolve(e.data.results); }
      };
      worker.onerror = function () {
        worker.terminate();
        resolve(indices.map(function () { return { error: "local retry failed" }; }));
      };
      worker.postMessage(payload);
    });
  }

  /* Cloud path: every image is uploaded to the server for conversion. */
  function runCloud() {
    els.convertBtn.disabled = true;
    els.progressWrap.classList.remove("hidden");
    els.progressBar.style.width = "4%";
    els.resultsPanel.classList.add("hidden");

    var fmtKey = { jpeg: "jpg", png: "png", webp: "webp" }[els.format.value] || "jpg";
    var qualityPct = parseInt(els.quality.value, 10);
    var maxDim = parseInt(els.maxDim.value, 10) || 0;

    var out = [];
    var chain = Promise.resolve();
    files.forEach(function (item) {
      chain = chain.then(function () {
        var f = item.file;
        var stopProc = null;
        showMsg("Uploading " + f.name + " to the cloud server…", "info");
        return window.CloudTools.post("/image/convert", {
          file: f,
          format: fmtKey,
          quality: qualityPct,
          max_dim: maxDim
        }, function (pct) {
          showMsg("Uploading " + f.name + "… " + pct + "%", "info");
        }, function (attempt) {
          if (stopProc) { stopProc(); stopProc = null; }
          showMsg("Cloud server is waking up (try " + attempt + " of 3) — the first request after idle can take up to a minute.", "info");
        }, function () {
          if (!stopProc) stopProc = window.CloudTools.trackProcessing(showMsg, f.name, els.msg);
        }).then(function (res) {
          if (stopProc) { stopProc(); stopProc = null; }
          var type = res.type || { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[fmtKey];
          return window.CloudTools.toBlob(res.bytes, type).then(function (d) {
            out.push({
              name: f.name,
              blob: d.blob,
              size: res.bytes.length,
              originalSize: f.size,
              width: d.w,
              height: d.h
            });
          });
        }).catch(function (err) {
          if (stopProc) { stopProc(); stopProc = null; }
          out.push({ name: f.name, error: String((err && err.message) || err) });
        }).then(function () {
          els.progressBar.style.width = Math.round((out.length / files.length) * 96) + "%";
        });
      });
    });

    chain.then(function () {
      var failedIdx = [];
      out.forEach(function (r, i) { if (r.error) failedIdx.push(i); });
      var fix = failedIdx.length
        ? runLocalBatch(failedIdx).then(function (localRes) {
            failedIdx.forEach(function (idx, k) {
              if (localRes[k] && !localRes[k].error) out[idx] = localRes[k];
            });
            if (failedIdx.length === files.length) {
              showMsg("Cloud was unavailable — all files were processed locally instead.", "info");
            }
          })
        : Promise.resolve();
      return fix.then(function () { finish(out); });
    });
  }

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
