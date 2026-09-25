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

  els.genBtn.addEventListener("click", function () {
    var text = els.text.value.trim();
    if (!text) { toast("Enter some text or a URL first.", "err"); return; }

    var size = parseInt(els.size.value, 10);

    els.qrHolder.innerHTML = "";

    new QRCode(els.qrHolder, {
      text: text,
      width: size,
      height: size,
      colorDark: els.fg.value,
      colorLight: els.bg.value,
      correctLevel: QRCode.CorrectLevel[els.ecl.value]
    });

    /* qrcodejs renders asynchronously (via canvas → img). Grab the canvas shortly after. */
    setTimeout(function () {
      var canvas = els.qrHolder.querySelector("canvas");
      if (canvas) {
        try { lastPng = canvas.toDataURL("image/png"); }
        catch (e) { lastPng = null; }
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
