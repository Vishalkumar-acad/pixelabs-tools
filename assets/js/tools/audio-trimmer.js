/* Audio Trimmer — Web Audio API, fully local */
"use strict";

(function () {

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor-panel"),
    wave: document.getElementById("wave"),
    start: document.getElementById("start"),
    end: document.getElementById("end"),
    dur: document.getElementById("dur"),
    selInfo: document.getElementById("sel-info"),
    play: document.getElementById("play-btn"),
    stop: document.getElementById("stop-btn"),
    cut: document.getElementById("cut-btn"),
    msg: document.getElementById("msg")
  };

  var ctx = null;          /* AudioContext */
  var buffer = null;       /* decoded AudioBuffer */
  var peaks = [];          /* downsampled waveform peaks */
  var sel = { a: 0, b: 0 }; /* selection in seconds */
  var playing = null;      /* active source node */
  var playInfo = null;     /* {started, from} for the playhead line */
  var fileName = "audio";
  var rawFile = null;

  var MIN_SEL = 0.05;      /* shortest allowed selection, seconds */
  var drag = null;         /* active pointer drag state */

  makeDropzone({ el: els.dropzone, accept: "audio", onFiles: function (files) { load(files[0]); } });
  /* ---- Local / Cloud toggle ---- */
  var procEl = document.getElementById("proc");
  var procNote = document.getElementById("proc-note");
  function isCloud() { return procEl && procEl.value === "cloud"; }
  function updateProcNote() {
    if (!procNote) return;
    procNote.textContent = isCloud()
      ? "Cloud mode: the file is uploaded to our own processing server, processed, and deleted immediately — nothing is stored. If the server is busy, the tool falls back to local processing automatically."
      : "How it works (local): everything runs on your device — nothing ever leaves it. Works offline too.";
  }
  if (procEl) procEl.addEventListener("change", updateProcNote);
  updateProcNote();

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  function load(file) {
    if (!file) return;
    fileName = baseName(file.name);
    rawFile = file;
    showMsg("Reading " + file.name + "…", "busy");
    readFileAsArrayBuffer(file).then(function (ab) {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx.decodeAudioData(ab);
    }).then(function (buf) {
      buffer = buf;
      sel = { a: 0, b: buf.duration };
      els.start.value = "0";
      els.end.value = buf.duration.toFixed(2);
      els.dur.textContent = fmtTime(buf.duration);
      buildPeaks();
      syncInputs();
      els.editor.classList.remove("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("Loaded. Tap the waveform to set start/end, or drag the handles to fine-tune.", "ok");
    }).catch(function () {
      showMsg("Could not decode this audio file. Try MP3, WAV, OGG or M4A.", "err");
    });
  }

  function buildPeaks() {
    var w = Math.max(300, els.wave.clientWidth || 600);
    var chs = [];
    for (var c = 0; c < buffer.numberOfChannels; c++) chs.push(buffer.getChannelData(c));
    var block = Math.floor(buffer.length / w) || 1;
    peaks = [];
    for (var i = 0; i < w; i++) {
      var max = 0;
      var startIdx = i * block;
      for (var j = 0; j < block; j += Math.max(1, Math.floor(block / 40))) {
        for (var c2 = 0; c2 < chs.length; c2++) {
          var v = Math.abs(chs[c2][startIdx + j] || 0);
          if (v > max) max = v;
        }
      }
      peaks.push(max);
    }
    draw();
  }

  /* redraw the waveform when the window / orientation changes size */
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (!buffer) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildPeaks, 150);
  });

  /* ---------- drawing ---------- */

  function fmtTime(t) {
    if (t == null || !isFinite(t)) return "0:00.0";
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }

  /* bubbleTime: when set, a live time bubble is drawn above that time */
  function draw(bubbleTime) {
    var canvas = els.wave;
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || 600;
    var cssH = 120;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    var g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, cssW, cssH);

    var mid = cssH / 2;
    var a = Math.min(sel.a, sel.b);
    var b = Math.max(sel.a, sel.b);
    var ax = (a / buffer.duration) * cssW;
    var bx = (b / buffer.duration) * cssW;

    /* waveform — selected part in accent, rest dimmed */
    for (var i = 0; i < peaks.length; i++) {
      var t = (i / peaks.length) * buffer.duration;
      g.fillStyle = (t >= a && t <= b) ? "#818cf8" : "rgba(130,140,165,.45)";
      var h = Math.max(1, peaks[i] * (cssH / 2 - 6));
      g.fillRect(i, mid - h, 1, h * 2);
    }

    /* veil over the parts that will be cut away */
    g.fillStyle = "rgba(10,13,21,.30)";
    if (ax > 0) g.fillRect(0, 0, ax, cssH);
    if (bx < cssW) g.fillRect(bx, 0, cssW - bx, cssH);

    /* playhead (synced to what is playing right now) */
    if (playInfo && playing && ctx) {
      var pt = playInfo.from + (ctx.currentTime - playInfo.started);
      if (pt >= b) { playInfo = null; }
      else {
        var px = (pt / buffer.duration) * cssW;
        g.fillStyle = "#22c55e";
        g.fillRect(px - 1, 0, 2, cssH);
        g.beginPath();
        g.moveTo(px - 6, 0); g.lineTo(px + 6, 0); g.lineTo(px, 8); g.closePath();
        g.fill();
        requestAnimationFrame(function () { draw(); });
      }
    }

    /* fat, touch-friendly handles */
    function handle(x, active) {
      g.fillStyle = "#6366f1";
      if (active) { g.shadowColor = "rgba(99,102,241,.55)"; g.shadowBlur = 10; }
      roundRect(g, x - 6, 1, 12, cssH - 2, 6);
      g.shadowBlur = 0;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(x, mid, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    handle(ax, drag && (drag.mode === "a"));
    handle(bx, drag && (drag.mode === "b"));

    /* live time bubble above the edge being dragged */
    if (bubbleTime != null) {
      var x = (bubbleTime / buffer.duration) * cssW;
      var label = fmtTime(bubbleTime);
      g.font = "600 12px Inter, system-ui, sans-serif";
      var tw = g.measureText(label).width + 16;
      var bxx = Math.max(2, Math.min(cssW - tw - 2, x - tw / 2));
      g.fillStyle = "#101527";
      roundRect(g, bxx, 3, tw, 20, 8);
      g.fillStyle = "#fff";
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(label, bxx + 8, 14);
    }
  }

  function syncInputs() {
    var a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
    els.start.value = a.toFixed(2);
    els.end.value = b.toFixed(2);
    if (els.selInfo) {
      els.selInfo.textContent = "Selected: " + fmtTime(a) + " → " + fmtTime(b) +
        "  (" + (b - a).toFixed(1) + "s kept of " + fmtTime(buffer.duration) + ")";
    }
  }

  /* ---------- pointer interaction (touch + mouse) ---------- */

  function clampT(t) {
    return Math.max(0, Math.min(buffer.duration, t));
  }
  function xToTime(x) {
    var rect = els.wave.getBoundingClientRect();
    var p = (x - rect.left) / rect.width;
    return clampT(p * buffer.duration);
  }

  /* which fat handle (if any) is under this x? generous touch zone */
  function edgeAt(clientX) {
    var rect = els.wave.getBoundingClientRect();
    var ax = rect.left + (Math.min(sel.a, sel.b) / buffer.duration) * rect.width;
    var bx = rect.left + (Math.max(sel.a, sel.b) / buffer.duration) * rect.width;
    var tol = Math.max(22, rect.width * 0.03);
    var da = Math.abs(clientX - ax), db = Math.abs(clientX - bx);
    if (da <= tol || db <= tol) return da <= db ? "a" : "b";
    return null;
  }

  els.wave.addEventListener("pointerdown", function (e) {
    if (!buffer) return;
    e.preventDefault();
    try { els.wave.setPointerCapture(e.pointerId); } catch (err) {}
    var t = xToTime(e.clientX);
    var edge = edgeAt(e.clientX);
    if (edge) {
      drag = { mode: edge, moved: false, startX: e.clientX };
    } else if (t > Math.min(sel.a, sel.b) && t < Math.max(sel.a, sel.b)) {
      drag = { mode: "move", startX: e.clientX, offA: Math.min(sel.a, sel.b), w: Math.abs(sel.b - sel.a), anchorT: t, moved: false };
    } else {
      drag = { mode: "new", anchor: t, startX: e.clientX, moved: false };
    }
  });

  els.wave.addEventListener("pointermove", function (e) {
    if (!buffer) return;
    if (!drag) {
      /* hover cursor hints (mouse only, harmless on touch) */
      var edge = edgeAt(e.clientX);
      var t = xToTime(e.clientX);
      els.wave.style.cursor = edge ? "ew-resize" :
        (t > Math.min(sel.a, sel.b) && t < Math.max(sel.a, sel.b)) ? "grab" : "crosshair";
      return;
    }
    if (Math.abs(e.clientX - drag.startX) > 3) drag.moved = true;
    var t2 = xToTime(e.clientX);
    var bubble = null;
    if (drag.mode === "a") {
      sel.a = Math.min(t2, Math.max(sel.b, sel.a) - MIN_SEL);
      bubble = sel.a;
    } else if (drag.mode === "b") {
      sel.b = Math.max(t2, Math.min(sel.a, sel.b) + MIN_SEL);
      bubble = sel.b;
    } else if (drag.mode === "move") {
      var dt = t2 - drag.anchorT;
      var w = drag.w;
      var a = drag.offA + dt;
      if (a < 0) a = 0;
      if (a + w > buffer.duration) a = buffer.duration - w;
      sel.a = a; sel.b = a + w;
    } else if (drag.mode === "new") {
      sel.a = Math.min(drag.anchor, t2);
      sel.b = Math.max(drag.anchor, t2);
      bubble = t2;
    }
    draw(bubble);
    syncInputs();
  });

  function endDrag(e) {
    if (!buffer || !drag) return;
    /* a plain tap with no movement: move the NEARER edge to the tap point,
       so one tap is enough to set the start or the end */
    if (!drag.moved && drag.mode !== "a" && drag.mode !== "b") {
      var t = xToTime(e.clientX);
      if (Math.abs(t - sel.a) <= Math.abs(t - sel.b)) {
        sel.a = Math.min(t, sel.b - MIN_SEL);
      } else {
        sel.b = Math.max(t, sel.a + MIN_SEL);
      }
    }
    if (sel.b < sel.a) { var tmp = sel.a; sel.a = sel.b; sel.b = tmp; }
    if (sel.b - sel.a < MIN_SEL) sel.b = Math.min(buffer.duration, sel.a + MIN_SEL);
    drag = null;
    draw();
    syncInputs();
  }
  els.wave.addEventListener("pointerup", endDrag);
  els.wave.addEventListener("pointercancel", function () { drag = null; draw(); });

  /* inputs sync */
  [els.start, els.end].forEach(function (inp) {
    inp.addEventListener("change", function () {
      if (!buffer) return;
      var a = Math.max(0, Math.min(buffer.duration, parseFloat(els.start.value) || 0));
      var b = Math.max(0, Math.min(buffer.duration, parseFloat(els.end.value) || 0));
      sel.a = a; sel.b = Math.max(a + MIN_SEL, b);
      draw();
      syncInputs();
    });
  });

  els.play.addEventListener("click", function () {
    if (!buffer) return;
    stopPlay();
    var a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0, a, Math.max(0.05, b - a));
    playing = src;
    playInfo = { started: ctx.currentTime, from: a };
    draw();
    src.onended = function () { playing = null; playInfo = null; draw(); };
  });

  function stopPlay() {
    if (playing) { try { playing.stop(); } catch (e) {} playing = null; }
    playInfo = null;
  }
  els.stop.addEventListener("click", function () { stopPlay(); draw(); });

  els.cut.addEventListener("click", function () {
    if (!buffer) return;
    var a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
    if (b - a < 0.05) { showMsg("Selection too short.", "err"); return; }
    if (isCloud() && rawFile) { cloudCut(a, b); return; }
    localCut(a, b);
  });

  function cloudCut(a, b) {
    /* Upload progress first, "processing" only once the file has arrived —
       otherwise the user sees "Processing…" while it is still uploading. */
    var stop = null;
    CloudTools.post("/audio/trim", {
      file: rawFile, start: a.toFixed(3), end: b.toFixed(3)
    }, function (pct) {
      if (stop) { stop(); stop = null; }
      showMsg("Uploading " + fileName + "… " + pct + "%", "info");
    }, function () {
      if (stop) { stop(); stop = null; }
      showMsg("Cloud server did not respond — retrying once…", "info");
    }, function () {
      if (!stop) stop = CloudTools.trackProcessing(showMsg, "your audio");
    }).then(function (res) {
      if (stop) stop();
      var blob = new Blob([res.bytes], { type: "audio/mpeg" });
      downloadBlob(blob, fileName + "-cut.mp3");
      showMsg("Done! Trimmed clip downloaded as MP3 (" + (b - a).toFixed(1) + "s, " + formatBytes(blob.size) + ").", "ok");
    }).catch(function () {
      if (stop) stop();
      showMsg("Cloud server unavailable — processing on your device instead. Your file never left it.", "info");
      localCut(a, b);
    });
  }

  function localCut(a, b) {
    showMsg("Encoding…", "busy");

    /* slice the buffer */
    var rate = buffer.sampleRate;
    var len = Math.floor((b - a) * rate);
    var out = ctx.createBuffer(buffer.numberOfChannels, len, rate);
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      out.getChannelData(c).set(buffer.getChannelData(c).subarray(Math.floor(a * rate), Math.floor(a * rate) + len));
    }
    try {
      var blob = encodeWav(out);
      downloadBlob(blob, fileName + "-cut.wav");
      showMsg("Done! Your trimmed clip (" + (b - a).toFixed(1) + "s) has been downloaded.", "ok");
    } catch (e) {
      showMsg("Encoding failed — try a shorter clip.", "err");
    }
  }

})();
