/* Audio Joiner — decode all files with one AudioContext, concat, export WAV */
"use strict";

(function () {

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor-panel"),
    list: document.getElementById("file-list"),
    gap: document.getElementById("gap"),
    join: document.getElementById("join-btn"),
    msg: document.getElementById("msg")
  };

  var ctx = null;
  var files = []; /* { name, buffer, id } */
  var uid = 0;

  makeDropzone({ el: els.dropzone, accept: "audio", multiple: true, onFiles: addFiles });

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  function addFiles(list) {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    showMsg("Reading " + list.length + " file(s)…", "busy");
    var jobs = list.map(function (f) {
      return readFileAsArrayBuffer(f).then(function (ab) {
        return ctx.decodeAudioData(ab).then(function (buf) {
          files.push({ name: f.name, buffer: buf, id: ++uid });
        }).catch(function () {
          showMsg("Skipped " + f.name + " — could not decode it.", "err");
        });
      });
    });
    Promise.all(jobs).then(function () {
      renderList();
      if (files.length) els.editor.classList.remove("hidden");
    });
  }

  function renderList() {
    els.list.innerHTML = "";
    files.forEach(function (f, i) {
      var row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML =
        '<div class="meta"><div class="name"></div>' +
        '<div class="size"></div></div>' +
        '<div class="controls"></div>';
      row.querySelector(".name").textContent = (i + 1) + ". " + f.name;
      row.querySelector(".size").textContent =
        f.buffer.duration.toFixed(1) + "s · " + f.buffer.sampleRate + " Hz";

      var controls = row.querySelector(".controls");
      function btn(txt, fn) {
        var b = document.createElement("button");
        b.textContent = txt;
        b.title = txt;
        b.addEventListener("click", fn);
        controls.appendChild(b);
      }
      btn("↑", function () { if (i > 0) { files.splice(i - 1, 0, files.splice(i, 1)[0]); renderList(); } });
      btn("↓", function () { if (i < files.length - 1) { files.splice(i + 1, 0, files.splice(i, 1)[0]); renderList(); } });
      btn("✕", function () { files.splice(i, 1); renderList(); });
      els.list.appendChild(row);
    });
  }

  els.join.addEventListener("click", function () {
    if (files.length < 2) { showMsg("Add at least two audio files first.", "err"); return; }
    showMsg("Joining " + files.length + " files…", "busy");

    var gap = Math.max(0, Math.min(10, parseFloat(els.gap.value) || 0));
    var rate = ctx.sampleRate;
    var channels = 1;
    files.forEach(function (f) { channels = Math.max(channels, f.buffer.numberOfChannels); });

    var gapLen = Math.floor(gap * rate);
    var totalLen = gapLen * (files.length - 1);
    files.forEach(function (f) { totalLen += f.buffer.length; });

    var out = ctx.createBuffer(channels, totalLen, rate);
    for (var c = 0; c < channels; c++) {
      var outData = out.getChannelData(c);
      var off = 0;
      for (var i = 0; i < files.length; i++) {
        var buf = files[i].buffer;
        var src = buf.getChannelData(Math.min(c, buf.numberOfChannels - 1));
        outData.set(src, off);
        off += buf.length + gapLen;
      }
    }

    try {
      downloadBlob(encodeWav(out), "joined.wav");
      showMsg("Done! " + files.length + " files joined into one WAV (" + out.duration.toFixed(1) + "s).", "ok");
    } catch (e) {
      showMsg("Export failed — try removing some files.", "err");
    }
  });

})();
