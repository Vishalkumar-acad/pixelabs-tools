/* Image Compressor — main-thread controller for the compression worker */
"use strict";

(function () {

  var files = [];          /* { file, id } */
  var results = [];
  var uid = 0;

  var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

  var dropzone = makeDropzone({
    el: document.getElementById("dropzone"),
    accept: "image/",
    multiple: true,
    onFiles: function (list) {
      list.forEach(function (f) {
        if (f.type.indexOf("image/") === 0) files.push({ file: f, id: ++uid });
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
    maxDim: document.getElementById("max-dim"),
    proc: document.getElementById("proc"),
    procNote: document.getElementById("proc-note")
  };

  els.mode.addEventListener("change", function () {
    var target = els.mode.value === "target";
    els.targetOpt.classList.toggle("hidden", !target);
    els.qualityOpt.classList.toggle("hidden", target);
  });

  function updateProcNote() {
    if (!els.procNote) return;
    if (els.proc.value === "cloud") {
      els.procNote.textContent = "Cloud mode: images are uploaded to our free processing server (Render), compressed with optimized libraries, and deleted immediately — nothing is stored. HEIC (iPhone) photos are also supported. If the server is busy, the tool falls back to local processing automatically.";
    } else {
      els.procNote.textContent = "How it works (local): compression runs entirely on your device — nothing ever leaves it. Works offline too.";
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
    if (els.proc.value === "cloud") { runCloud(); return; }
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

  /* Run a local worker batch for a subset of files (cloud fallback). */
  function runLocalBatch(indices) {
    return new Promise(function (resolve) {
      var payload = {
        type: "compress-batch",
        mime: { jpeg: "image/jpeg", webp: "image/webp" }[els.format.value],
        quality: parseInt(els.quality.value, 10) / 100,
        maxDim: parseInt(els.maxDim.value, 10) || 0,
        targetBytes: 0,
        files: indices.map(function (i) {
          return { file: files[i].file, name: files[i].file.name, index: files[i].id };
        })
      };
      if (els.mode.value === "target") {
        var amount = parseFloat(els.targetKb.value);
        payload.targetBytes = amount ? Math.round(amount * parseInt(els.targetUnit.value, 10)) : 0;
      }
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

  /* Cloud path: every image is uploaded to the server for processing. */
  function runCloud() {
    els.compressBtn.disabled = true;
    els.progressWrap.classList.remove("hidden");
    els.progressBar.style.width = "4%";
    els.resultsPanel.classList.add("hidden");

    var mode = els.mode.value;
    var targetKb = 0;
    if (mode === "target") {
      var amount = parseFloat(els.targetKb.value);
      if (!amount || amount <= 0) {
        showMsg("Enter a valid target size.", "err");
        els.compressBtn.disabled = false;
        els.progressWrap.classList.add("hidden");
        return;
      }
      targetKb = Math.max(1, Math.round(amount * parseInt(els.targetUnit.value, 10) / 1024));
    }
    var fmtKey = els.format.value === "webp" ? "webp" : "jpg";
    var qualityPct = parseInt(els.quality.value, 10);
    var maxDim = parseInt(els.maxDim.value, 10) || 0;

    var out = [];
    var chain = Promise.resolve();
    files.forEach(function (item) {
      chain = chain.then(function () {
        var f = item.file;
        showMsg("Uploading " + f.name + " to the cloud server…", "info");
        return window.CloudTools.post("/image/compress", {
          file: f,
          level: "medium",
          target_kb: targetKb,
          quality: mode === "quality" ? qualityPct : 0,
          max_dim: maxDim,
          format: fmtKey
        }, function (pct) {
          showMsg("Uploading " + f.name + "… " + pct + "%", "info");
        }, function (attempt) {
          showMsg("Cloud server is waking up (try " + attempt + " of 3) — the first request after idle can take up to a minute.", "info");
        }).then(function (res) {
          var type = res.kept ? (res.type || "image/jpeg") : (fmtKey === "webp" ? "image/webp" : "image/jpeg");
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
      return fix.then(function () {
        var totalSaved = 0;
        out.forEach(function (r) { if (!r.error) totalSaved += Math.max(0, r.originalSize - r.size); });
        els.progressBar.style.width = "100%";
        finish(out, totalSaved);
      });
    });
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
      var ext = EXT[r.blob.type] || "jpg";
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
      var ext = EXT[r.blob.type] || "jpg";
      zip.file(baseName(r.name) + "." + ext, r.blob);
    });
    els.zipBtn.disabled = true;
    var blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "compressed-images.zip");
    els.zipBtn.disabled = false;
  });

})();
