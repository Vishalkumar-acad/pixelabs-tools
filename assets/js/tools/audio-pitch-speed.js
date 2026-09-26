/* Audio Speed & Pitch Changer — Web Audio API, tape style, fully local */
"use strict";

(function () {

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor-panel"),
    mode: document.getElementById("mode"),
    slider: document.getElementById("slider"),
    val: document.getElementById("val"),
    label: document.getElementById("slider-label"),
    preview: document.getElementById("preview-btn"),
    exportBtn: document.getElementById("export-btn"),
    msg: document.getElementById("msg")
  };

  var ctx = null;
  var buffer = null;
  var fileName = "audio";
  var previewUrl = null;
  var previewAudio = null;

  makeDropzone({ el: els.dropzone, accept: "audio", onFiles: function (files) { load(files[0]); } });

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  function load(file) {
    if (!file) return;
    fileName = baseName(file.name);
    showMsg("Reading " + file.name + "…", "busy");
    readFileAsArrayBuffer(file).then(function (ab) {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx.decodeAudioData(ab);
    }).then(function (buf) {
      buffer = buf;
      els.editor.classList.remove("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("Loaded " + file.name + " (" + buf.duration.toFixed(1) + "s). Move the slider, then preview or download.", "ok");
      updateLabel();
    }).catch(function () {
      showMsg("Could not decode this audio file. Try MP3, WAV, OGG or M4A.", "err");
    });
  }

  function factor() {
    var n = parseInt(els.slider.value, 10);
    return els.mode.value === "speed" ? (1 + n * 0.125) : Math.pow(2, n / 12);
  }

  function updateLabel() {
    var n = parseInt(els.slider.value, 10);
    if (els.mode.value === "speed") {
      els.label.textContent = "Speed: " + factor().toFixed(2) + "\u00d7";
    } else {
      els.label.textContent = "Pitch: " + (n > 0 ? "+" : "") + n + " semitone" + (Math.abs(n) === 1 ? "" : "s");
    }
  }

  els.mode.addEventListener("change", updateLabel);
  els.slider.addEventListener("input", updateLabel);

  function render(cb) {
    var f = factor();
    var newLen = Math.max(1, Math.floor(buffer.length / f));
    var off = new OfflineAudioContext(buffer.numberOfChannels, newLen, buffer.sampleRate);
    var src = off.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = f;
    src.connect(off.destination);
    src.start(0);
    off.startRendering().then(function (out) { cb(out); }).catch(function () {
      showMsg("Rendering failed — try a different setting.", "err");
    });
  }

  els.preview.addEventListener("click", function () {
    if (!buffer) return;
    var f = factor();
    showMsg("Rendering preview…", "busy");
    render(function (out) {
      if (previewAudio) { previewAudio.pause(); }
      if (previewUrl) { URL.revokeObjectURL(previewUrl); }
      previewUrl = URL.createObjectURL(new Blob([encodeWav(out)], { type: "audio/wav" }));
      previewAudio = new Audio(previewUrl);
      previewAudio.play().catch(function () {});
      showMsg("Playing preview — new duration " + out.duration.toFixed(1) + "s (was " + buffer.duration.toFixed(1) + "s).", "ok");
    });
  });

  els.exportBtn.addEventListener("click", function () {
    if (!buffer) return;
    showMsg("Rendering…", "busy");
    render(function (out) {
      try {
        downloadBlob(encodeWav(out), fileName + "-changed.wav");
        showMsg("Done! Downloaded as WAV — new duration " + out.duration.toFixed(1) + "s.", "ok");
      } catch (e) {
        showMsg("Export failed — try a different setting.", "err");
      }
    });
  });

  updateLabel();

})();
