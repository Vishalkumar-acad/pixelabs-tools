/* ============================================================
   PixelAbs Tools — PDF Compressor
   Rebuilds each PDF page as an optimized image inside a new
   document (pdf.js renders, pdf-lib assembles). 100% client-side.
   ============================================================ */
"use strict";

(function () {

  var LEVELS = {
    high:   { scale: 2.0, quality: 0.85 },
    medium: { scale: 1.4, quality: 0.72 },
    low:    { scale: 1.0, quality: 0.55 }
  };

  /* Cloud endpoint — same-origin edge functions (the Cloudflare
     Worker proxies these to the processing server — see worker.js). */
  var SPACE_URL = "/api";

  /* Point pdf.js at its vendored worker (relative to this page). */
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      new URL("../assets/vendor/pdf.worker.min.js", location.href).toString();
  }

  /* ---------- DOM ---------- */
  var dropzoneEl = document.getElementById("dropzone");
  var levelSel = document.getElementById("level");
  var modeSel = document.getElementById("mode");
  var noteEl = document.getElementById("how-note");
  var runBtn = document.getElementById("compress-btn");
  var clearBtn = document.getElementById("clear-btn");
  var msgEl = document.getElementById("msg");
  var progressWrap = document.getElementById("progress-wrap");
  var progressBar = document.getElementById("progress-bar");
  var resultsPanel = document.getElementById("results-panel");
  var summaryEl = document.getElementById("summary");
  var resultsEl = document.getElementById("results");
  var zipBtn = document.getElementById("zip-btn");

  var files = [];
  var outputs = []; /* { name, bytes } */
  var busy = false;

  function showMsg(text, kind) {
    msgEl.textContent = text;
    msgEl.className = "msg " + (kind || "info");
  }

  function updateButtons() {
    runBtn.disabled = files.length === 0 || busy;
    clearBtn.disabled = files.length === 0 || busy;
  }

  function clearAll() {
    files = [];
    outputs = [];
    resultsPanel.classList.add("hidden");
    progressWrap.classList.add("hidden");
    progressBar.style.width = "0%";
    msgEl.className = "msg";
    updateButtons();
  }

  function setFiles(list) {
    files = list.slice();
    outputs = [];
    resultsPanel.classList.add("hidden");
    if (files.length) {
      showMsg(files.length + (files.length === 1 ? " PDF ready." : " PDFs ready.") + " Choose a level and press Compress.", "info");
    }
    updateButtons();
  }

  /* ---------- Core: compress one PDF ----------
     Renders every page with pdf.js at the chosen scale, re-encodes
     each page as a JPEG at the chosen quality, and assembles a new
     document with pdf-lib. Returns the new PDF bytes. */
  /* Cap each page to ~2.2 megapixels — big scanned pages at full
     scale can exhaust mobile canvas memory and stall the render. */
  var MAX_PAGE_PIXELS = 2200000;

  /* Reject if a single step never settles (mobile canvas context
     loss can leave a pdf.js render pending forever). */
  function withTimeout(promise, ms, what) {
    return Promise.race([
      promise,
      new Promise(function (resolve, reject) {
        setTimeout(function () { reject(new Error(what + " timed out")); }, ms);
      })
    ]);
  }

  async function compressFile(file, level, onProgress) {
    var buf = await readFileAsArrayBuffer(file);
    var src = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    var numPages = src.numPages;
    var out = await window.PDFLib.PDFDocument.create();

    for (var p = 1; p <= numPages; p++) {
      var page = await src.getPage(p);
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
      await withTimeout(page.render({ canvasContext: ctx, viewport: viewport }).promise, 60000, "page " + p);
      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error("page " + p + " could not be encoded"));
        }, "image/jpeg", level.quality);
      });
      var imgBytes = new Uint8Array(await blob.arrayBuffer());
      var img = await out.embedJpg(imgBytes);
      var p2 = out.addPage([canvas.width, canvas.height]);
      p2.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      canvas.width = 0;
      canvas.height = 0;
      try { page.cleanup(); } catch (e) {}
      if (onProgress) onProgress();
      await new Promise(function (r) { setTimeout(r, 0); });
    }

    src.destroy();
    showMsg("Building the final PDF…", "info");
    return out.save();
  }

  /* Try the chosen level; if the result is not smaller, retry at the
     lowest level; if it still can't beat the original, keep the original
     file untouched (digitally-created PDFs are often already optimal). */
  function tryCompress(file, level, onProgress) {
    var outName = baseName(file.name) + "-compressed.pdf";
    return compressFile(file, level, onProgress).then(function (bytes) {
      if (bytes.length < file.size) return { name: outName, bytes: bytes };
      showMsg("First pass was larger than the original — retrying at the smallest-file level…", "info");
      return compressFile(file, LEVELS.low, onProgress).then(function (bytes2) {
        if (bytes2.length < file.size) return { name: outName, bytes: bytes2 };
        return readFileAsArrayBuffer(file).then(function (orig) {
          return { name: file.name, bytes: new Uint8Array(orig), kept: true };
        });
      });
    });
  }

  /* ---------- Cloud path ---------- */
  function cloudCompressOnce(file, levelKey, onUpload, onUploaded) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("level", levelKey);
      var xhr = new XMLHttpRequest();
      xhr.open("POST", SPACE_URL + "/compress");
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
          resolve({ bytes: new Uint8Array(xhr.response), kept: xhr.getResponseHeader("X-Kept") === "1" });
        } else {
          reject(new Error("server error " + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error("network error")); };
      xhr.ontimeout = function () { reject(new Error("timeout")); };
      xhr.send(fd);
    });
  }

  /* Live "Processing..." status while the server compresses an
     uploaded file, so the tool never looks stuck. Returns stop(). */
  function startProcTimer(name) {
    if (window.CloudTools && window.CloudTools.trackProcessing) {
      return window.CloudTools.trackProcessing(showMsg, name, msgEl);
    }
    showMsg("Processing " + name + " on the cloud server…", "info");
    return function () {};
  }

  /* The free Space sleeps when idle — a 5xx usually means it is
     waking up, so retry a few times before falling back. */
  function cloudCompress(file, levelKey, onUpload, onWake, onUploaded) {
    var attempt = 0;
    function go() {
      attempt++;
      return cloudCompressOnce(file, levelKey, onUpload, onUploaded).catch(function (err) {
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

  /* ---------- Run all ---------- */
  function run() {
    if (busy) return;
    if (!window.pdfjsLib || !window.PDFLib) {
      missingLib(window.pdfjsLib ? "pdf-lib" : "pdf.js");
      return;
    }
    if (modeSel.value === "cloud" && !SPACE_URL) {
      showMsg("Cloud processing is not connected yet — please use Local for now.", "err");
      return;
    }
    busy = true;
    updateButtons();
    outputs = [];
    resultsEl.innerHTML = "";
    resultsPanel.classList.add("hidden");
    progressWrap.classList.remove("hidden");
    var anyBig = files.some(function (f) { return f.size > 3145728; });
    showMsg(anyBig && modeSel.value !== "cloud" ? "Compressing… (tip: Cloud mode is faster for large PDFs)" : "Compressing…", "info");

    var level = LEVELS[levelSel.value];

    /* First pass: count pages so the progress bar is accurate. */
    var countChain = Promise.resolve();
    var totalPages = 0;
    files.forEach(function (f) {
      countChain = countChain.then(function () {
        return readFileAsArrayBuffer(f).then(function (buf) {
          return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise.then(function (doc) {
            totalPages += doc.numPages;
            doc.destroy();
          });
        });
      });
    });

    countChain.then(function () {
      var done = 0;
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          if (modeSel.value === "cloud") {
            var stopProc = null;
            showMsg("Uploading " + f.name + " to the cloud server…", "info");
            return cloudCompress(f, levelSel.value, function (pct) {
              showMsg("Uploading " + f.name + "… " + pct + "%", "info");
            }, function (attempt) {
              if (stopProc) { stopProc(); stopProc = null; }
              showMsg("Cloud server is waking up (try " + attempt + " of 3) — the first request after idle can take up to a minute.", "info");
            }, function () {
              if (!stopProc) stopProc = startProcTimer(f.name);
            }).then(function (res) {
              if (stopProc) { stopProc(); stopProc = null; }
              outputs.push({
                name: res.kept ? f.name : baseName(f.name) + "-compressed.pdf",
                bytes: res.bytes,
                kept: res.kept
              });
            }).catch(function (err) {
              if (stopProc) { stopProc(); stopProc = null; }
              showMsg("Cloud unavailable (" + String((err && err.message) || err) + ") — using local processing instead.", "info");
              return tryCompress(f, level, function () {
                done++;
                var pctDone = Math.min(100, Math.round((done / totalPages) * 100));
                progressBar.style.width = pctDone + "%";
                showMsg("Compressing locally… page " + Math.min(done, totalPages) + " of " + totalPages, "info");
              }).then(function (res2) {
                outputs.push(res2);
              });
            });
          }
          return tryCompress(f, level, function () {
            done++;
            var pctDone = Math.min(100, Math.round((done / totalPages) * 100));
            progressBar.style.width = pctDone + "%";
            showMsg("Compressing… page " + Math.min(done, totalPages) + " of " + totalPages, "info");
          }).then(function (res) {
            outputs.push(res);
          }).catch(function (err) {
            outputs.push({ name: baseName(f.name) + "-compressed.pdf", error: String((err && err.message) || err) });
          });
        });
      });

      return chain;
    }).then(function () {
      progressWrap.classList.add("hidden");
      busy = false;
      updateButtons();

      var okCount = 0;
      var inBytes = 0;
      var outBytes = 0;
      var bad = [];

      outputs.forEach(function (o, i) {
        if (o.error) {
          bad.push(files[i].name);
          return;
        }
        okCount++;
        inBytes += files[i].size;
        outBytes += o.bytes.length;
      });

      if (okCount === 0) {
        showMsg("Compression failed: " + (bad[0] || "unknown error"), "err");
        return;
      }
      if (bad.length) {
        showMsg("Done, but these files failed: " + bad.join(", ") + " — try Cloud mode for these (it handles big PDFs better).", "err");
      } else {
        var keptCount = 0;
        outputs.forEach(function (o) { if (o.kept) keptCount++; });
        var m = "Done! " + okCount + (okCount === 1 ? " PDF" : " PDFs") + " compressed.";
        if (keptCount) m += " " + keptCount + (keptCount === 1 ? " was" : " were") + " already optimal (original kept).";
        showMsg(m, "ok");
      }

      if (inBytes > outBytes) {
        Savings.add(inBytes - outBytes);
      }

      var pct = inBytes > 0 ? Math.round((1 - outBytes / inBytes) * 100) : 0;
      summaryEl.innerHTML =
        "<div class='stat'><div class='v'>" + formatBytes(inBytes) + "</div><div class='k'>Original</div></div>" +
        "<div class='stat good'><div class='v'>" + formatBytes(outBytes) + "</div><div class='k'>Compressed</div></div>" +
        "<div class='stat'><div class='v'>-" + pct + "%</div><div class='k'>Saved</div></div>";

      resultsEl.innerHTML = "";
      outputs.forEach(function (o, i) {
        var row = document.createElement("div");
        row.className = "file-row done";
        var orig = files[i].size;
        var inner;
        if (o.error) {
          inner = "<span class='meta'><span class='name'>" + escapeHtml(o.name) + "</span>" +
                  "<span class='size'><span class='delta-bad'>Failed</span></span></span>";
        } else if (o.kept) {
          inner = "<span class='meta'><span class='name'>" + escapeHtml(o.name) + "</span>" +
                  "<span class='size'>" + formatBytes(orig) + " <span class='delta-good'>(already optimal — kept)</span></span></span>" +
                  "<span class='controls'><button title='Download' data-dl='" + i + "'>⬇</button></span>";
        } else {
          var delta = orig >= o.bytes.length ? "-" + formatBytes(orig - o.bytes.length) : "+" + formatBytes(o.bytes.length - orig);
          var cls = orig >= o.bytes.length ? "delta-good" : "delta-bad";
          inner = "<span class='meta'><span class='name'>" + escapeHtml(o.name) + "</span>" +
                  "<span class='size'>" + formatBytes(orig) + " → " + formatBytes(o.bytes.length) +
                  " <span class='" + cls + "'>(" + delta + ")</span></span></span>" +
                  "<span class='controls'><button title='Download' data-dl='" + i + "'>⬇</button></span>";
        }
        row.innerHTML = inner;
        resultsEl.appendChild(row);
      });

      Array.prototype.forEach.call(resultsEl.querySelectorAll("button[data-dl]"), function (btn) {
        btn.addEventListener("click", function () {
          var o = outputs[Number(btn.getAttribute("data-dl"))];
          if (o && o.bytes) downloadBlob(new Blob([o.bytes], { type: "application/pdf" }), o.name);
        });
      });

      resultsPanel.classList.remove("hidden");
    }).catch(function (err) {
      busy = false;
      updateButtons();
      progressWrap.classList.add("hidden");
      showMsg("Compression failed: " + String((err && err.message) || err), "err");
    });
  }

  zipBtn.addEventListener("click", function () {
    var good = outputs.filter(function (o) { return o.bytes; });
    if (!good.length) return;
    if (good.length === 1) {
      downloadBlob(new Blob([good[0].bytes], { type: "application/pdf" }), good[0].name);
      return;
    }
    var zip = new JSZip();
    good.forEach(function (o) { zip.file(o.name, o.bytes); });
    zip.generateAsync({ type: "blob" }).then(function (blob) {
      downloadBlob(blob, "pixelabs-pdfs.zip");
    });
  });

  /* ---------- Wire up ---------- */
  makeDropzone({
    el: dropzoneEl,
    accept: "application/pdf",
    multiple: true,
    onFiles: setFiles
  });

  function updateNote() {
    if (!noteEl) return;
    if (modeSel.value === "cloud") {
      noteEl.textContent = "Cloud mode: your file is uploaded to our free processing server (Render), processed with Ghostscript, and deleted immediately — nothing is stored or logged. If the server is unavailable, the tool falls back to local processing automatically.";
    } else {
      noteEl.textContent = "How it works (local): pages are re-rendered as optimized images inside a rebuilt PDF — all on your device, nothing ever leaves it. Scanned/photo PDFs shrink the most; if a PDF is already well-optimized the tool keeps your original.";
    }
  }
  if (modeSel) modeSel.addEventListener("change", updateNote);
  updateNote();

  runBtn.addEventListener("click", run);
  clearBtn.addEventListener("click", clearAll);

  /* E2E test hook (also handy for power users in the console). */
  window.__pdfCompress = function (file, levelKey) {
    return compressFile(file, LEVELS[levelKey] || LEVELS.medium, null);
  };
  window.__pdfTryCompress = function (file, levelKey) {
    return tryCompress(file, LEVELS[levelKey] || LEVELS.medium, null);
  };
  window.__pdfCloud = function (file, levelKey) {
    return cloudCompress(file, levelKey, null, null);
  };
  window.__setSpaceUrl = function (u) { SPACE_URL = u; };

})();
