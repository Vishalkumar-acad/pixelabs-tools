/* Video to GIF — canvas frame extraction + gif.js, fully local */
"use strict";

(function () {

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor-panel"),
    video: document.getElementById("video"),
    start: document.getElementById("start"),
    end: document.getElementById("end"),
    width: document.getElementById("width"),
    fps: document.getElementById("fps"),
    make: document.getElementById("make-btn"),
    msg: document.getElementById("msg"),
    result: document.getElementById("result-panel"),
    img: document.getElementById("gif-img"),
    download: document.getElementById("download-btn")
  };

  var lastBlob = null;
  var busy = false;
  var rawFile = null;

  makeDropzone({ el: els.dropzone, accept: "video", onFiles: function (files) { load(files[0]); } });
  /* ---- Local / Cloud toggle ---- */
  var procEl = document.getElementById("proc");
  var procNote = document.getElementById("proc-note");
  function isCloud() { return procEl && procEl.value === "cloud"; }
  function updateProcNote() {
    if (!procNote) return;
    procNote.textContent = isCloud()
      ? "Cloud mode: the file is uploaded to our free processing server (Render), processed, and deleted immediately — nothing is stored. If the server is busy, the tool falls back to local processing automatically."
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
    rawFile = file;
    els.video.src = URL.createObjectURL(file);
    els.video.onloadedmetadata = function () {
      var dur = Math.min(15, els.video.duration || 15);
      els.start.value = "0";
      els.end.value = dur.toFixed(1);
      els.editor.classList.remove("hidden");
      els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("Video loaded (" + (els.video.duration || 0).toFixed(1) + "s). GIF clips are capped at 15 seconds.", "ok");
    };
    els.video.onerror = function () {
      showMsg("Could not play this video format in the browser. Try MP4 or WEBM.", "err");
    };
  }

  function seek(t) {
    return new Promise(function (resolve) {
      els.video.onseeked = function () { els.video.onseeked = null; resolve(); };
      els.video.currentTime = t;
    });
  }

  els.make.addEventListener("click", function () {
    if (busy) return;
    var start = Math.max(0, parseFloat(els.start.value) || 0);
    if (isCloud() && rawFile) { cloudGif(); return; }
    var end = Math.min(els.video.duration || 15, parseFloat(els.end.value) || 5);
    if (end <= start) { showMsg("End time must be after start time.", "err"); return; }
    if (end - start > 15) { end = start + 15; showMsg("Capped to 15 seconds.", "info"); }
    var fps = parseInt(els.fps.value, 10);
    var w = parseInt(els.width.value, 10);
    var vw = els.video.videoWidth || w;
    var vh = els.video.videoHeight || Math.round(w * 9 / 16);
    var gw = w;
    var gh = Math.max(2, Math.round(vh * (w / vw)));

    busy = true;
    els.make.disabled = true;
    showMsg("Extracting frames… 0%", "busy");

    var canvas = document.createElement("canvas");
    canvas.width = gw;
    canvas.height = gh;
    var g = canvas.getContext("2d");

    var gif = new GIF({
      workers: 2,
      quality: 10,
      width: gw,
      height: gh,
      workerScript: new URL("../assets/vendor/gif.worker.js", document.baseURI).href
    });

    var frames = Math.round((end - start) * fps);
    var i = 0;

    function addNext() {
      if (i >= frames) {
        showMsg("Encoding GIF… 0%", "busy");
        gif.on("progress", function (p) { showMsg("Encoding GIF… " + Math.round(p * 100) + "%", "busy"); });
        gif.on("finished", function (blob) {
          lastBlob = blob;
          if (els.img.src) URL.revokeObjectURL(els.img.src);
          els.img.src = URL.createObjectURL(blob);
          els.result.classList.remove("hidden");
          els.result.scrollIntoView({ behavior: "smooth", block: "start" });
          showMsg("Done! GIF ready (" + formatBytes(blob.size) + ", " + frames + " frames).", "ok");
          busy = false;
          els.make.disabled = false;
        });
        gif.render();
        return;
      }
      var t = start + i / fps;
      seek(t).then(function () {
        g.drawImage(els.video, 0, 0, gw, gh);
        gif.addFrame(g, { copy: true, delay: Math.round(1000 / fps) });
        i++;
        showMsg("Extracting frames… " + Math.round((i / frames) * 100) + "%", "busy");
        addNext();
      }).catch(function () {
        showMsg("Could not read a frame — try a slightly different range.", "err");
        busy = false;
        els.make.disabled = false;
      });
    }
    addNext();
  });

  function cloudGif() {
    var start = Math.max(0, parseFloat(els.start.value) || 0);
    var end = Math.min(els.video.duration || 15, parseFloat(els.end.value) || 5);
    if (end <= start) { showMsg("End time must be after start time.", "err"); return; }
    if (end - start > 30) { end = start + 30; }
    var width = parseInt(els.width.value, 10);
    var fps = parseInt(els.fps.value, 10);
    busy = true;
    els.make.disabled = true;
    var stop = CloudTools.trackProcessing(showMsg, "your video");
    CloudTools.post("/video/gif", {
      file: rawFile, start: start.toFixed(3), end: end.toFixed(3),
      width: width, fps: fps
    }).then(function (res) {
      stop();
      lastBlob = new Blob([res.bytes], { type: "image/gif" });
      if (els.img.src) URL.revokeObjectURL(els.img.src);
      els.img.src = URL.createObjectURL(lastBlob);
      els.result.classList.remove("hidden");
      els.result.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("Done! GIF ready from the server (" + formatBytes(lastBlob.size) + ", " + Math.round(end - start) + "s).", "ok");
      busy = false;
      els.make.disabled = false;
    }).catch(function () {
      stop();
      busy = false;
      els.make.disabled = false;
      showMsg("Cloud processing failed — switch 'Processing' to Local and try again.", "err");
    });
  }

  els.download.addEventListener("click", function () {
    if (lastBlob) downloadBlob(lastBlob, "animation.gif");
  });

})();
