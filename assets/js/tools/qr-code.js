/* QR Code Generator — qrcodejs, rendered locally */
"use strict";

(function () {

  var els = {
    text: document.getElementById("text"),
    size: document.getElementById("size"),
    fg: document.getElementById("fg"),
    bg: document.getElementById("bg"),
    ecl: document.getElementById("ecl"),
    genBtn: document.getElementById("gen-btn"),
    qrPanel: document.getElementById("qr-panel"),
    qrHolder: document.getElementById("qr-holder"),
    downloadBtn: document.getElementById("download-btn")
  };

  if (typeof QRCode === "undefined") { missingLib("qrcode.js"); return; }

  var lastPng = null;

  /* The QR spec requires a quiet zone — a clear margin of 4 modules on
     every side. Without it many scanners cannot find the code's edges.
     qrcodejs fills its canvas edge-to-edge, so we recompose the image
     onto a larger canvas with the proper margin before display/download. */
  function withQuietZone(canvas, modules, bgColor) {
    var size = canvas.width;
    var mod = modules > 0 ? size / modules : size / 25;
    var pad = Math.max(4, Math.round(4 * mod)); /* 4 modules per side */
    var out = document.createElement("canvas");
    out.width = size + pad * 2;
    out.height = size + pad * 2;
    var ctx = out.getContext("2d");
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    return out;
  }

  els.genBtn.addEventListener("click", function () {
    var text = els.text.value.trim();
    if (!text) { toast("Enter some text or a URL first.", "err"); return; }

    var size = parseInt(els.size.value, 10);

    els.qrHolder.innerHTML = "";

    var qr = new QRCode(els.qrHolder, {
      text: text,
      width: size,
      height: size,
      colorDark: els.fg.value,
      colorLight: els.bg.value,
      correctLevel: QRCode.CorrectLevel[els.ecl.value]
    });

    /* qrcodejs renders asynchronously (via canvas → img). Compose the
       quiet-zone version shortly after. */
    setTimeout(function () {
      var canvas = els.qrHolder.querySelector("canvas");
      if (canvas) {
        try {
          var modules = qr._oQRCode ? qr._oQRCode.getModuleCount() : 0;
          var padded = withQuietZone(canvas, modules, els.bg.value);
          /* show exactly what will be downloaded */
          els.qrHolder.innerHTML = "";
          padded.style.width = "100%";
          padded.style.height = "auto";
          padded.style.display = "block";
          els.qrHolder.appendChild(padded);
          lastPng = padded.toDataURL("image/png");
        } catch (e) { lastPng = null; }
      }
      els.qrPanel.classList.remove("hidden");
      els.qrPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  });

  els.downloadBtn.addEventListener("click", function () {
    var canvas = els.qrHolder.querySelector("canvas");
    if (!canvas) { toast("Generate a QR code first.", "err"); return; }
    var a = document.createElement("a");
    a.href = lastPng || canvas.toDataURL("image/png");
    a.download = "qr-code.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* Regenerate automatically when options change if a code is showing */
  [els.size, els.fg, els.bg, els.ecl].forEach(function (el) {
    el.addEventListener("change", function () {
      if (!els.qrPanel.classList.contains("hidden")) els.genBtn.click();
    });
  });

})();
