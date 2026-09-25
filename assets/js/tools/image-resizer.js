/* Image Resizer — single image, live preview, presets */
"use strict";

(function () {

  var state = { file: null, img: null, blob: null, name: "", w: 0, h: 0, ratio: 1 };

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor"),
    preset: document.getElementById("preset"),
    w: document.getElementById("w"),
    h: document.getElementById("h"),
    lock: document.getElementById("lock"),
    format: document.getElementById("format"),
    applyBtn: document.getElementById("apply-btn"),
    previewPanel: document.getElementById("preview-panel"),
    preview: document.getElementById("preview"),
    summary: document.getElementById("summary"),
    downloadBtn: document.getElementById("download-btn")
  };

  makeDropzone({
    el: els.dropzone,
    accept: "image/",
    multiple: false,
    onFiles: function (list) { load(list[0]); }
  });

  function load(file) {
    if (!/^image\//.test(file.type)) { toast("That file is not an image.", "err"); return; }
    var img = new Image();
    img.onload = function () {
      state.file = file;
      state.img = img;
      state.name = file.name;
      state.w = img.naturalWidth;
      state.h = img.naturalHeight;
      state.ratio = img.naturalWidth / img.naturalHeight;
      els.w.value = state.w;
      els.h.value = state.h;
      els.preset.value = "";
      els.editor.classList.remove("hidden");
      els.previewPanel.classList.add("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    img.onerror = function () { toast("Could not read that image.", "err"); };
    img.src = URL.createObjectURL(file);
  }

  /* Aspect lock */
  var syncing = false;
  els.w.addEventListener("input", function () {
    if (!els.lock.checked || syncing) return;
    var w = parseInt(els.w.value, 10);
    if (w > 0) { syncing = true; els.h.value = Math.max(1, Math.round(w / state.ratio)); syncing = false; }
  });
  els.h.addEventListener("input", function () {
    if (!els.lock.checked || syncing) return;
    var h = parseInt(els.h.value, 10);
    if (h > 0) { syncing = true; els.w.value = Math.max(1, Math.round(h * state.ratio)); syncing = false; }
  });

  els.preset.addEventListener("change", function () {
    if (!els.preset.value) return;
    var parts = els.preset.value.split("x");
    els.w.value = parts[0];
    els.h.value = parts[1];
  });

  els.applyBtn.addEventListener("click", function () {
    if (!state.img) return;
    var w = parseInt(els.w.value, 10);
    var h = parseInt(els.h.value, 10);
    if (!w || !h || w < 1 || h < 1 || w > 12000 || h > 12000) {
      toast("Enter a valid width and height (1–12000 px).", "err");
      return;
    }

    var mime = els.format.value || (state.file.type === "image/png" ? "image/png" : "image/jpeg");
    if (els.format.value === "") {
      /* keep original type when supported by canvas export */
      if (!/^image\/(png|jpeg|webp)$/.test(state.file.type)) mime = "image/jpeg";
    }

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(state.img, 0, 0, w, h);

    canvas.toBlob(function (blob) {
      if (!blob) { toast("Export failed — try a different format.", "err"); return; }
      state.blob = blob;
      var ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime];
      state.ext = ext;
      els.preview.src = URL.createObjectURL(blob);
      els.summary.innerHTML =
        stat(w + " × " + h, "New size") +
        stat(state.w + " × " + state.h, "Original") +
        stat(formatBytes(blob.size), "File size");
      els.previewPanel.classList.remove("hidden");
      els.previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }, mime, 0.92);
  });

  els.downloadBtn.addEventListener("click", function () {
    if (state.blob) downloadBlob(state.blob, baseName(state.name) + "-" + els.w.value + "x" + els.h.value + "." + state.ext);
  });

  function stat(v, k) {
    return "<div class='stat'><div class='v'>" + v + "</div><div class='k'>" + k + "</div></div>";
  }

})();
