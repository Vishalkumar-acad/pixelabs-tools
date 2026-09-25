/* ============================================================
   PixelAbs Tools — image compression worker
   Runs OFF the main thread using OffscreenCanvas.
   Core algorithm: binary search on encoder quality to hit a
   target file size; progressively down-scales when quality
   alone cannot reach the target.
   ============================================================ */
"use strict";

var MIME = {
  jpeg: "image/jpeg",
  webp: "image/webp"
};

/* Render a bitmap at w x h into a compressed blob at given quality */
function render(bitmap, w, h, mime, quality) {
  var canvas = new OffscreenCanvas(w, h);
  var ctx = canvas.getContext("2d");
  /* JPEG has no alpha: paint a white background first */
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type: mime, quality: quality });
}

/* Compress a single file to reach targetBytes.
   Returns { blob, size, width, height } */
async function compressToTarget(bitmap, targetBytes, mime) {
  var w = bitmap.width, h = bitmap.height;
  var MIN_DIM = 32;

  for (var scaleRound = 0; scaleRound < 14; scaleRound++) {
    var lo = 0.01, hi = 0.96;
    var best = null;

    for (var i = 0; i < 8; i++) {
      var q = (lo + hi) / 2;
      var blob = await render(bitmap, w, h, mime, q);
      if (blob.size <= targetBytes) {
        best = blob;
        lo = q; /* try a higher quality */
      } else {
        hi = q; /* lower the quality */
      }
    }

    if (best) return { blob: best, size: best.size, width: w, height: h };

    /* Even the lowest quality overshoots the target — shrink dimensions */
    if (w <= MIN_DIM || h <= MIN_DIM) break;
    w = Math.max(MIN_DIM, Math.round(w * 0.8));
    h = Math.max(MIN_DIM, Math.round(h * 0.8));
  }

  /* Could not reach target: return smallest possible */
  var last = await render(bitmap, w, h, mime, 0.01);
  return { blob: last, size: last.size, width: w, height: h };
}

/* Compress at a fixed quality (slider mode), optional max dimension */
async function compressAtQuality(bitmap, mime, quality, maxDim) {
  var w = bitmap.width, h = bitmap.height;
  if (maxDim && Math.max(w, h) > maxDim) {
    var scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  var blob = await render(bitmap, w, h, mime, quality);
  return { blob: blob, size: blob.size, width: w, height: h };
}

self.onmessage = async function (e) {
  var msg = e.data;

  if (msg.type !== "compress-batch") return;

  var results = [];
  var totalSaved = 0;

  for (var i = 0; i < msg.files.length; i++) {
    var item = msg.files[i];
    try {
      var bitmap = await createImageBitmap(item.file);
      var out;

      if (msg.targetBytes > 0) {
        out = await compressToTarget(bitmap, msg.targetBytes, msg.mime);
      } else {
        out = await compressAtQuality(bitmap, msg.mime, msg.quality, msg.maxDim);
      }

      var saved = item.file.size - out.size;
      totalSaved += saved;

      results.push({
        name: item.name, index: item.index,
        blob: out.blob, size: out.size,
        width: out.width, height: out.height,
        originalSize: item.file.size, saved: saved
      });

      bitmap.close && bitmap.close();
    } catch (err) {
      results.push({ name: item.name, index: item.index, error: String(err && err.message || err) });
    }

    self.postMessage({ type: "progress", done: i + 1, total: msg.files.length });
  }

  self.postMessage({ type: "done", results: results, totalSaved: totalSaved });
};
