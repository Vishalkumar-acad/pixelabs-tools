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
  var fileName = "audio";

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
      sel = { a: 0, b: buf.duration };
      els.start.value = "0";
      els.end.value = buf.duration.toFixed(2);
      els.dur.textContent = buf.duration.toFixed(2) + "s · " + buf.sampleRate + " Hz";
      buildPeaks();
      els.editor.classList.remove("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("Loaded. Drag on the waveform to select the part to keep.", "ok");
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
        for (var c = 0; c < chs.length; c++) {
          var v = Math.abs(chs[c][startIdx + j] || 0);
          if (v > max) max = v;
        }
      }
      peaks.push(max);
    }
    draw();
  }

  function draw() {
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
    var a = sel.b > sel.a ? sel.a : sel.b;
    var b = sel.b > sel.a ? sel.b : sel.a;

    for (var i = 0; i < peaks.length; i++) {
      var t = (i / peaks.length) * buffer.duration;
      var inSel = t >= a && t <= b;
      g.fillStyle = inSel ? "#818cf8" : "rgba(130,140,165,.45)";
      var h = Math.max(1, peaks[i] * (cssH / 2 - 6));
      g.fillRect(i, mid - h, 1, h * 2);
    }
    /* selection edges */
    g.fillStyle = "#6366f1";
    g.fillRect((a / buffer.duration) * cssW, 0, 2, cssH);
    g.fillRect((b / buffer.duration) * cssW, 0, 2, cssH);
  }

  /* pointer selection */
  var dragStartX = -1;
  function xToTime(x) {
    var rect = els.wave.getBoundingClientRect();
    var p = (x - rect.left) / rect.width;
    return Math.max(0, Math.min(buffer.duration, p * buffer.duration));
  }
  els.wave.addEventListener("pointerdown", function (e) {
    if (!buffer) return;
    els.wave.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    sel.a = xToTime(e.clientX);
    sel.b = sel.a;
    draw();
  });
  els.wave.addEventListener("pointermove", function (e) {
    if (dragStartX < 0 || !buffer) return;
    sel.a = xToTime(dragStartX);
    sel.b = xToTime(e.clientX);
    draw();
    var a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
    els.start.value = a.toFixed(2);
    els.end.value = b.toFixed(2);
  });
  els.wave.addEventListener("pointerup", function () {
    dragStartX = -1;
    if (sel.b < sel.a) { var t = sel.a; sel.a = sel.b; sel.b = t; }
    if (sel.b - sel.a < 0.01) { sel.a = 0; sel.b = buffer.duration; }
    els.start.value = sel.a.toFixed(2);
    els.end.value = sel.b.toFixed(2);
  });

  /* inputs sync */
  [els.start, els.end].forEach(function (inp) {
    inp.addEventListener("change", function () {
      if (!buffer) return;
      var a = Math.max(0, Math.min(buffer.duration, parseFloat(els.start.value) || 0));
      var b = Math.max(0, Math.min(buffer.duration, parseFloat(els.end.value) || 0));
      sel.a = a; sel.b = Math.max(a + 0.01, b);
      draw();
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
    src.onended = function () { playing = null; };
  });

  function stopPlay() {
    if (playing) { try { playing.stop(); } catch (e) {} playing = null; }
  }
  els.stop.addEventListener("click", stopPlay);

  els.cut.addEventListener("click", function () {
    if (!buffer) return;
    var a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
    if (b - a < 0.05) { showMsg("Selection too short.", "err"); return; }
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
  });

})();
