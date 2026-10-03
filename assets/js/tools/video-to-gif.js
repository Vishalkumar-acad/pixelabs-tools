/* Video to GIF — canvas frame extraction + gif.js, fully local.
   Also supports Photos → GIF: any set of photos becomes the frames. */
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
    download: document.getElementById("download-btn"),

    prog: document.getElementById("prog"),
    progBar: document.getElementById("prog-bar"),

    modeVideo: document.getElementById("mode-video"),
    modePhotos: document.getElementById("mode-photos"),
    videoSection: document.getElementById("video-section"),
    photosSection: document.getElementById("photos-section"),
    photoDrop: document.getElementById("photo-dropzone"),
    photoPanel: document.getElementById("photo-panel"),
    photoList: document.getElementById("photo-list"),
    photoWidth: document.getElementById("photo-width"),
    photoFit: document.getElementById("photo-fit"),
    photoBg: document.getElementById("photo-bg"),
    photoMake: document.getElementById("photo-make"),
    photoMsg: document.getElementById("photo-msg"),
    photoProg: document.getElementById("photo-prog"),
    photoProgBar: document.getElementById("photo-prog-bar")
  };

  var lastBlob = null;
  var busy = false;
  var rawFile = null;

  /* ---------- progress helpers ---------- */

  function setBar(wrap, bar, pct) {
    if (!wrap || !bar) return;
    wrap.classList.remove("hidden");
    bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }
  function endBar(wrap) {
    if (wrap) wrap.classList.add("hidden");
  }

  /* ---------- mode switching ---------- */

  function setMode(m) {
    var video = m === "video";
    els.videoSection.classList.toggle("hidden", !video);
    els.photosSection.classList.toggle("hidden", video);
    els.modeVideo.className = "btn " + (video ? "btn-primary" : "btn-secondary");
    els.modePhotos.className = "btn " + (!video ? "btn-primary" : "btn-secondary");
  }
  els.modeVideo.addEventListener("click", function () { setMode("video"); });
  els.modePhotos.addEventListener("click", function () { setMode("photos"); });

  makeDropzone({ el: els.dropzone, accept: "video", onFiles: function (files) { load(files[0]); } });

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
  function showPhotoMsg(text, kind) {
    els.photoMsg.textContent = text;
    els.photoMsg.className = "msg " + (kind || "info");
  }

  /* ================= PHOTOS → GIF ================= */

  var photos = []; /* {img, name, size, dur, url} */

  makeDropzone({
    el: els.photoDrop, accept: "image", multiple: true,
    onFiles: function (files) { addPhotos(files); }
  });

  function addPhotos(files) {
    var imgs = [];
    files.forEach(function (f) {
      if (f && /^image\//.test(f.type)) imgs.push(f);
    });
    if (!imgs.length) { toast("No image files found.", "err"); return; }

    /* reserve slots so photos land in the order they were picked,
       no matter which one finishes loading first */
    var base = photos.length;
    var loaded = 0;
    for (var k = 0; k < imgs.length; k++) photos.push(null);

    function allDone() {
      photos = photos.filter(Boolean); /* drop any that failed to load */
      renderPhotos();
      els.photoPanel.classList.remove("hidden");
      els.photoPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      showPhotoMsg("Added " + photos.length + " photo" + (photos.length > 1 ? "s" : "") + ". Reorder with the arrows, set each duration, then Create GIF.", "ok");
    }

    imgs.forEach(function (f, idx) {
      var url = URL.createObjectURL(f);
      var img = new Image();
      img.onload = function () {
        photos[base + idx] = { img: img, name: f.name, size: f.size, dur: 0.8, url: url };
        if (++loaded === imgs.length) allDone();
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        if (++loaded === imgs.length) allDone();
      };
      img.src = url;
    });
  }

  function renderPhotos() {
    els.photoList.innerHTML = "";
    photos.forEach(function (p, i) {
      var row = document.createElement("div");
      row.className = "file-row";

      var thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = p.url;
      thumb.alt = "";

      var meta = document.createElement("div");
      meta.className = "meta";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = (i + 1) + ". " + p.name;
      var size = document.createElement("div");
      size.className = "size";
      size.textContent = formatBytes(p.size) + " · " + p.img.naturalWidth + "×" + p.img.naturalHeight;
      meta.appendChild(name);
      meta.appendChild(size);

      var durWrap = document.createElement("div");
      durWrap.style.display = "flex";
      durWrap.style.alignItems = "center";
      durWrap.style.gap = "6px";
      durWrap.style.flexShrink = "0";
      var dur = document.createElement("input");
      dur.type = "number";
      dur.min = "0.1";
      dur.step = "0.1";
      dur.value = p.dur.toFixed(1);
      dur.style.width = "64px";
      dur.title = "Seconds this photo stays on screen";
      dur.addEventListener("change", function () {
        p.dur = Math.max(0.1, parseFloat(dur.value) || 0.8);
        dur.value = p.dur.toFixed(1);
      });
      var durLabel = document.createElement("span");
      durLabel.className = "size";
      durLabel.textContent = "sec";
      durWrap.appendChild(dur);
      durWrap.appendChild(durLabel);

      var controls = document.createElement("div");
      controls.className = "controls";
      function btn(txt, title, fn) {
        var b = document.createElement("button");
        b.textContent = txt;
        b.title = title;
        b.addEventListener("click", fn);
        return b;
      }
      controls.appendChild(btn("↑", "Move earlier", function () {
        if (i > 0) { photos.splice(i - 1, 0, photos.splice(i, 1)[0]); renderPhotos(); }
      }));
      controls.appendChild(btn("↓", "Move later", function () {
        if (i < photos.length - 1) { photos.splice(i + 1, 0, photos.splice(i, 1)[0]); renderPhotos(); }
      }));
      controls.appendChild(btn("✕", "Remove", function () {
        URL.revokeObjectURL(p.url);
        photos.splice(i, 1);
        renderPhotos();
        if (!photos.length) els.photoPanel.classList.add("hidden");
      }));

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(durWrap);
      row.appendChild(controls);
      els.photoList.appendChild(row);
    });
  }

  els.photoMake.addEventListener("click", function () {
    if (busy) return;
    if (!photos.length) { toast("Add some photos first.", "err"); return; }

    var w = parseInt(els.photoWidth.value, 10);
    var fit = els.photoFit.value;
    var bg = els.photoBg.value;

    /* the GIF takes the shape of the FIRST photo */
    var p0 = photos[0].img;
    var gw = w;
    var gh = Math.max(2, Math.round(p0.naturalHeight * (w / p0.naturalWidth)));

    busy = true;
    els.photoMake.disabled = true;
    els.photoMake.textContent = "Encoding… 0%";
    showPhotoMsg("Encoding GIF… 0%", "busy");
    setBar(els.photoProg, els.photoProgBar, 0);

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

    photos.forEach(function (p) {
      g.fillStyle = bg;
      g.fillRect(0, 0, gw, gh);
      var iw = p.img.naturalWidth, ih = p.img.naturalHeight;
      var scale = fit === "fill"
        ? Math.max(gw / iw, gh / ih)   /* cover: crop to fill, no bars */
        : Math.min(gw / iw, gh / ih);  /* contain: whole photo always visible */
      var dw = iw * scale, dh = ih * scale;
      var dx = (gw - dw) / 2, dy = (gh - dh) / 2;
      g.drawImage(p.img, dx, dy, dw, dh);
      gif.addFrame(g, { copy: true, delay: Math.round(p.dur * 1000) });
    });

    gif.on("progress", function (pr) {
      var pc = Math.round(pr * 100);
      showPhotoMsg("Encoding GIF… " + pc + "%", "busy");
      els.photoMake.textContent = "Encoding… " + pc + "%";
      setBar(els.photoProg, els.photoProgBar, pc);
    });
    gif.on("finished", function (blob) {
      lastBlob = blob;
      if (els.img.src) URL.revokeObjectURL(els.img.src);
      els.img.src = URL.createObjectURL(blob);
      els.result.classList.remove("hidden");
      els.result.scrollIntoView({ behavior: "smooth", block: "start" });
      showPhotoMsg("Done! GIF ready (" + formatBytes(blob.size) + ", " + photos.length + " photos, " + gw + "×" + gh + ").", "ok");
      busy = false;
      els.photoMake.disabled = false;
      els.photoMake.textContent = "Create GIF from photos";
      endBar(els.photoProg);
    });
    gif.render();
  });

  /* ================= VIDEO → GIF ================= */

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
    els.make.textContent = "Extracting… 0%";
    showMsg("Extracting frames… 0%", "busy");
    setBar(els.prog, els.progBar, 0);

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
        els.make.textContent = "Encoding… 0%";
        gif.on("progress", function (p) {
          var pc = Math.round(p * 100);
          showMsg("Encoding GIF… " + pc + "%", "busy");
          els.make.textContent = "Encoding… " + pc + "%";
          setBar(els.prog, els.progBar, pc);
        });
        gif.on("finished", function (blob) {
          lastBlob = blob;
          if (els.img.src) URL.revokeObjectURL(els.img.src);
          els.img.src = URL.createObjectURL(blob);
          els.result.classList.remove("hidden");
          els.result.scrollIntoView({ behavior: "smooth", block: "start" });
          showMsg("Done! GIF ready (" + formatBytes(blob.size) + ", " + frames + " frames).", "ok");
          busy = false;
          els.make.disabled = false;
          els.make.textContent = "Create GIF";
          endBar(els.prog);
        });
        gif.render();
        return;
      }
      var t = start + i / fps;
      seek(t).then(function () {
        g.drawImage(els.video, 0, 0, gw, gh);
        gif.addFrame(g, { copy: true, delay: Math.round(1000 / fps) });
        i++;
        var pc = Math.round((i / frames) * 100);
        showMsg("Extracting frames… " + pc + "%", "busy");
        els.make.textContent = "Extracting… " + pc + "%";
        setBar(els.prog, els.progBar, pc);
        addNext();
      }).catch(function () {
        showMsg("Could not read a frame — try a slightly different range.", "err");
        busy = false;
        els.make.disabled = false;
        els.make.textContent = "Create GIF";
        endBar(els.prog);
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
    els.make.textContent = "Uploading… 0%";
    showMsg("Uploading your video to the cloud server… 0%", "busy");
    setBar(els.prog, els.progBar, 0);
    var stop = null;
    CloudTools.post("/video/gif", {
      file: rawFile, start: start.toFixed(3), end: end.toFixed(3),
      width: width, fps: fps
    },
    function (p) {
      /* uploading the file — proof it really goes to the server */
      if (stop) { stop(); stop = null; }
      showMsg("Uploading your video to the cloud server… " + p + "%", "busy");
      els.make.textContent = "Uploading… " + p + "%";
      setBar(els.prog, els.progBar, p);
    },
    function (attempt) {
      /* free server was asleep — waking it up */
      showMsg("Cloud server is waking up — retrying (attempt " + attempt + " of 3)…", "info");
    },
    function () {
      /* upload finished — server is now processing */
      if (stop) stop();
      stop = CloudTools.trackProcessing(showMsg, "your video");
      els.make.textContent = "Processing…";
      setBar(els.prog, els.progBar, 100);
    }).then(function (res) {
      if (stop) stop();
      lastBlob = new Blob([res.bytes], { type: "image/gif" });
      if (els.img.src) URL.revokeObjectURL(els.img.src);
      els.img.src = URL.createObjectURL(lastBlob);
      els.result.classList.remove("hidden");
      els.result.scrollIntoView({ behavior: "smooth", block: "start" });
      showMsg("Done! GIF ready from the server (" + formatBytes(lastBlob.size) + ", " + Math.round(end - start) + "s).", "ok");
      busy = false;
      els.make.disabled = false;
      els.make.textContent = "Create GIF";
      endBar(els.prog);
    }).catch(function () {
      if (stop) stop();
      busy = false;
      els.make.disabled = false;
      els.make.textContent = "Create GIF";
      endBar(els.prog);
      showMsg("Cloud server unavailable — your video was never uploaded. Switch 'Processing' to Local to make the GIF on your device.", "info");
    });
  }

  els.download.addEventListener("click", function () {
    if (lastBlob) downloadBlob(lastBlob, "animation.gif");
  });

})();
