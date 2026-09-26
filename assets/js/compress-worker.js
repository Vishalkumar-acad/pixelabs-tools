/* ============================================================
   PixelAbs Tools — image compression worker
   Runs OFF the main thread using OffscreenCanvas.
   Core algorithm: smart target-size search — keep quality readable,
   gently reduce dimensions instead of crushing quality.
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

/* Compress a single file to reach targetBytes — the SMART way.
   Crushing JPEG quality to hit a size looks terrible (blocky text,
   washed-out colors). Instead: never go below FLOOR quality while the
   image can still be made smaller. A slightly smaller image at good
   quality always looks better than a full-size image at terrible
   quality — especially photos of documents, forms and exam papers.
   Returns { blob, size, width, height } */
async function compressToTarget(bitmap, targetBytes, mime) {
  var w = bitmap.width, h = bitmap.height;
  var FLOOR = 0.45;    /* lowest "still looks good" quality */
  var MIN_EDGE = 500;  /* do not shrink below this long edge — text must stay readable */

  /* Stage 1: shrink 15% at a time until the target is reachable at
     FLOOR quality, then binary-search the best quality at that size. */
  while (true) {
    var floorBlob = await render(bitmap, w, h, mime, FLOOR);
    if (floorBlob.size <= targetBytes) {
      var lo = FLOOR, hi = 0.96;
      var best = floorBlob;
      for (var i = 0; i < 7; i++) {
        var q = (lo + hi) / 2;
        var blob = await render(bitmap, w, h, mime, q);
        if (blob.size <= targetBytes) {
          best = blob;
          lo = q; /* try a higher quality */
        } else {
          hi = q; /* lower the quality */
        }
      }
      return { blob: best, size: best.size, width: w, height: h };
    }
    if (w <= MIN_EDGE || h <= MIN_EDGE) break;
    w = Math.round(w * 0.85);
    h = Math.round(h * 0.85);
  }

  /* Stage 2: already at the readability limit — let quality fall
     below the floor as a last resort (very small targets). */
  var lo2 = 0.01, hi2 = 0.96, best2 = null;
  for (var j = 0; j < 8; j++) {
    var q2 = (lo2 + hi2) / 2;
    var blob2 = await render(bitmap, w, h, mime, q2);
    if (blob2.size <= targetBytes) {
      best2 = blob2;
      lo2 = q2;
    } else {
      hi2 = q2;
    }
  }
  if (best2) return { blob: best2, size: best2.size, width: w, height: h };

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
        origWidth: bitmap.width, origHeight: bitmap.height,
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
