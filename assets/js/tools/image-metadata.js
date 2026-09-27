/* Image Metadata (EXIF) — view what a photo reveals, then strip it clean */
"use strict";

(function () {

  if (typeof exifr === "undefined") { missingLib("exifr"); return; }

  var state = { file: null, bytes: null, ext: "" };

  var els = {
    dropzone: document.getElementById("dropzone"),
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    out: document.getElementById("meta-out"),
    removeBtn: document.getElementById("remove-btn"),
    msg: document.getElementById("msg"),
    note: document.getElementById("remove-note")
  };

  makeDropzone({ el: els.dropzone, accept: "image/", onFiles: function (files) { load(files[0]); } });

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  function load(file) {
    if (!file || !/^image\//.test(file.type)) {
      toast("That file is not an image.", "err");
      return;
    }
    state.file = file;
    state.ext = (file.name.split(".").pop() || "").toLowerCase();
    showMsg("Reading metadata…", "busy");
    els.out.innerHTML = "";
    els.preview.src = URL.createObjectURL(file);

    readFileAsArrayBuffer(file).then(function (ab) {
      state.bytes = new Uint8Array(ab);

      /* exifr cannot read WebP containers directly, but a WebP EXIF chunk
         holds a plain TIFF blob — extract it and hand that to exifr. */
      var toParse = file;
      if (detect(state.bytes) === "webp") {
        var eb = webpExifChunk(state.bytes);
        if (eb) toParse = eb;
        else { render({}); return null; }
      }
      return exifr.parse(toParse, {
        tiff: true, exif: true, gps: true, ifd0: true,
        interop: true, xmp: true,
        reviveValues: true, translateValues: true
      });
    }).then(function (meta) {
      if (meta !== null) render(meta || {});
    }).catch(function () {
      render({});
    });

    els.editor.classList.remove("hidden");
    els.editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- rendering ---------- */

  var CAMERA_KEYS = ["Make", "Model", "LensMake", "LensModel", "BodySerialNumber",
    "FNumber", "ExposureTime", "ISO", "ISOSpeedRatings", "FocalLength",
    "FocalLengthIn35mmFormat", "Flash", "WhiteBalance", "MeteringMode", "ExposureProgram"];
  var DATE_KEYS = ["DateTimeOriginal", "CreateDate", "ModifyDate", "DateTime", "SubSecTimeOriginal"];

  function fmt(key, v) {
    if (v instanceof Date) {
      return v.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
        ", " + v.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    }
    if (key === "ExposureTime" && typeof v === "number" && v > 0 && v < 1) {
      return "1/" + Math.round(1 / v) + " s";
    }
    if (key === "ExposureTime" && typeof v === "number") return v + " s";
    if (key === "FNumber" && typeof v === "number") return "f/" + v;
    if (key === "FocalLength" && typeof v === "number") return v + " mm";
    if (typeof v === "number" && Math.abs(v) < 0.001 && v !== 0) return v.toExponential(4);
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  function row(k, v) {
    return '<div class="file-row" style="justify-content:space-between; gap:10px;">' +
      '<div class="meta" style="flex:1; min-width:0;"><div class="name">' + escapeHtml(k) + '</div></div>' +
      '<div style="text-align:right; overflow-wrap:anywhere; max-width:60%;">' + escapeHtml(v) + '</div></div>';
  }

  function section(title, html) {
    return '<h2 style="font-size:1.05rem; margin:16px 0 8px;">' + title + '</h2>' + html;
  }

  function render(meta) {
    var used = {};
    var html = "";

    /* basic file info */
    var dims = "";
    var img = new Image();
    img.onload = function () {
      dims = img.naturalWidth + " × " + img.naturalHeight + " px";
      finish();
    };
    img.onerror = finish;
    img.src = els.preview.src;

    function finish() {
      var info = [
        ["File name", state.file.name],
        ["File size", formatBytes(state.file.size)],
        ["Dimensions", dims || "—"],
        ["Format", (state.file.type || "image").replace("image/", "").toUpperCase()]
      ];
      html += section("📄 File", info.map(function (r) { return row(r[0], r[1]); }).join(""));

      /* GPS */
      var lat = meta.latitude, lon = meta.longitude;
      if (typeof lat === "number" && typeof lon === "number") {
        used.latitude = used.longitude = true;
        html += section("📍 Location (GPS)", row("Latitude", lat.toFixed(6)) + row("Longitude", lon.toFixed(6)) +
          '<p class="muted" style="font-size:.8rem; margin:8px 0 0;">Your exact position is embedded in this photo — ' +
          '<a href="https://www.google.com/maps?q=' + lat + "," + lon + '" target="_blank" rel="noopener">see it on Google Maps</a>.</p>');
      }

      /* camera */
      var cam = [];
      CAMERA_KEYS.forEach(function (k) {
        if (meta[k] !== undefined && meta[k] !== null && meta[k] !== "") {
          used[k] = true;
          cam.push(row(k, fmt(k, meta[k])));
        }
      });
      if (cam.length) html += section("📷 Camera & photo", cam.join(""));

      /* dates */
      var dates = [];
      DATE_KEYS.forEach(function (k) {
        if (meta[k] !== undefined && meta[k] !== null) {
          used[k] = true;
          dates.push(row(k, fmt(k, meta[k])));
        }
      });
      if (dates.length) html += section("🕐 Date & time", dates.join(""));

      /* everything else */
      var other = [];
      Object.keys(meta).forEach(function (k) {
        if (used[k]) return;
        var v = meta[k];
        if (v === null || v === undefined || typeof v === "object") return;
        other.push(row(k, fmt(k, v)));
      });
      if (other.length) html += section("📋 Other tags (" + other.length + ")", other.join(""));

      if (!lat && !cam.length && !dates.length && !other.length) {
        html += '<p class="msg ok">No metadata found — this file is already clean. ✓</p>';
        els.removeBtn.disabled = true;
        els.note.textContent = "";
      } else {
        els.removeBtn.disabled = false;
        els.note.textContent = "";
      }

      els.out.innerHTML = html;
      showMsg("", "");

      /* removal support */
      var kind = detect(state.bytes);
      if (!kind) {
        els.removeBtn.disabled = true;
        els.note.textContent = "This image format cannot be cleaned locally (byte-level stripping supports JPG, PNG and WEBP). Convert it to JPG with our Image Converter first.";
      }
    }
  }

  /* ---------- lossless metadata stripping ---------- */

  function detect(b) {
    if (!b || b.length < 12) return null;
    if (b[0] === 0xFF && b[1] === 0xD8) return "jpeg";
    if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return "png";
    if (b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70 &&
        b[8] === 87 && b[9] === 69 && b[10] === 66 && b[11] === 80) return "webp";
    return null;
  }

  /* Pull the raw TIFF/EXIF payload out of a WebP's EXIF chunk. */
  function webpExifChunk(b) {
    var i = 12;
    while (i + 8 <= b.length) {
      var fcc = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
      var len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
      if (i + 8 + len > b.length) return null;
      if (fcc === "EXIF") return b.subarray(i + 8, i + 8 + len);
      i += 8 + len + (len & 1);
    }
    return null;
  }

  function concat(chunks) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var o = 0;
    for (var j = 0; j < chunks.length; j++) { out.set(chunks[j], o); o += chunks[j].length; }
    return out;
  }

  /* JPEG: keep only the image itself (SOI + JFIF APP0 + image segments) */
  function stripJpeg(b) {
    var chunks = [b.subarray(0, 2)];
    var i = 2;
    while (i + 1 < b.length) {
      if (b[i] !== 0xFF) return null;
      var m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0xD9) { chunks.push(b.subarray(i, i + 2)); break; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { chunks.push(b.subarray(i, i + 2)); i += 2; continue; }
      if (i + 4 > b.length) return null;
      var len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) return null;
      var seg = b.subarray(i, i + 2 + len);
      if (m === 0xDA) { /* start of scan: copy this + all entropy data verbatim */
        chunks.push(seg);
        chunks.push(b.subarray(i + 2 + len));
        break;
      }
      var keep = true;
      if (m === 0xFE) keep = false;                         /* COM (comments) */
      else if (m >= 0xE0 && m <= 0xEF) keep = (m === 0xE0); /* APPn: keep only JFIF APP0 */
      if (keep) chunks.push(seg);
      i += 2 + len;
    }
    return concat(chunks);
  }

  /* PNG: keep only critical chunks (IHDR, PLTE, IDAT, IEND) */
  function stripPng(b) {
    var chunks = [b.subarray(0, 8)];
    var i = 8;
    while (i + 8 <= b.length) {
      var len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
      var c0 = b[i + 4], c1 = b[i + 5], c2 = b[i + 6], c3 = b[i + 7];
      var type = String.fromCharCode(c0, c1, c2, c3);
      var total = 12 + len;
      if (i + total > b.length) break;
      if (c0 >= 65 && c0 <= 90) chunks.push(b.subarray(i, i + total)); /* uppercase = critical */
      i += total;
      if (type === "IEND") break;
    }
    return concat(chunks);
  }

  /* WebP: drop EXIF / XMP / ICCP chunks, fix RIFF size */
  function stripWebp(b) {
    var chunks = [b.subarray(0, 12)];
    var i = 12;
    while (i + 8 <= b.length) {
      var fcc = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
      var len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
      var padded = len + (len & 1);
      if (i + 8 + len > b.length) break;
      if (fcc !== "EXIF" && fcc !== "XMP " && fcc !== "ICCP") {
        chunks.push(b.subarray(i, i + 8 + padded));
      }
      i += 8 + padded;
    }
    var out = concat(chunks);
    var size = out.length - 8;
    out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >> 24) & 255;
    return out;
  }

  els.removeBtn.addEventListener("click", function () {
    if (!state.bytes) return;
    var kind = detect(state.bytes);
    var clean = null;
    if (kind === "jpeg") clean = stripJpeg(state.bytes);
    else if (kind === "png") clean = stripPng(state.bytes);
    else if (kind === "webp") clean = stripWebp(state.bytes);
    if (!clean) {
      showMsg("Could not clean this file — its structure was not recognised.", "err");
      return;
    }
    var blob = new Blob([clean], { type: state.file.type || "image/jpeg" });
    var name = baseName(state.file.name) + "-clean." + (state.ext || "jpg");
    downloadBlob(blob, name);
    var saved = state.file.size - blob.size;
    showMsg("Done! " + name + " downloaded (" + formatBytes(blob.size) + ", " +
      (saved > 0 ? formatBytes(saved) + " of metadata removed" : "metadata removed") + ").", "ok");
    toast(name + " downloaded", "ok");

    /* verify the cleaned copy really has no metadata */
    exifr.parse(blob, { tiff: true, exif: true, gps: true, ifd0: true, xmp: true })
      .then(function (m) {
        if (!m || !Object.keys(m).length) {
          els.note.textContent = "Verified: the downloaded copy contains no EXIF / GPS / XMP metadata. ✓";
        } else {
          els.note.textContent = "Note: a few tags (" + Object.keys(m).slice(0, 5).join(", ") + ") could not be removed automatically — converting the file to JPG first usually clears them.";
        }
      })
      .catch(function () { els.note.textContent = "Verified: the downloaded copy contains no EXIF / GPS / XMP metadata. ✓"; });
  });

})();
