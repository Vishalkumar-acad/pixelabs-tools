/* JSON Formatter & Validator — all local */
"use strict";

(function () {

  var els = {
    input: document.getElementById("input"),
    output: document.getElementById("output"),
    msg: document.getElementById("msg"),
    copyBtn: document.getElementById("copy-btn"),
    downloadBtn: document.getElementById("download-btn")
  };

  var SAMPLE = JSON.stringify({
    name: "PixelAbs Tools",
    free: true,
    ads: 0,
    features: ["image compression", "pdf merge", "qr codes"],
    privacy: { filesUploaded: "never", tracking: "none" }
  }, null, 2);

  document.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var action = btn.getAttribute("data-action");
      var text = els.input.value.trim();

      if (action === "sample") { els.input.value = SAMPLE; showMsg("Sample JSON loaded.", "info"); return; }
      if (action === "clear") { els.input.value = ""; els.output.textContent = "Formatted JSON will appear here."; showMsg("", ""); return; }
      if (!text) { showMsg("Paste some JSON first.", "err"); return; }

      try {
        var parsed = JSON.parse(text);
        showMsg("✓ Valid JSON", "ok");
        if (action === "format2") els.output.textContent = JSON.stringify(parsed, null, 2);
        if (action === "format4") els.output.textContent = JSON.stringify(parsed, null, 4);
        if (action === "minify") els.output.textContent = JSON.stringify(parsed);
        if (action === "validate") els.output.textContent = JSON.stringify(parsed, null, 2);
      } catch (err) {
        /* Extract line/column from the parser message for a helpful position */
        var pos = "";
        var m = String(err.message).match(/position (\d+)/);
        if (m) {
          var upto = text.slice(0, parseInt(m[1], 10));
          var line = upto.split("\n").length;
          var col = upto.length - upto.lastIndexOf("\n");
          pos = " (line " + line + ", column " + col + ")";
        }
        showMsg("✗ Invalid JSON: " + err.message + pos, "err");
      }
    });
  });

  els.copyBtn.addEventListener("click", function () {
    var text = els.output.textContent;
    if (!text || text === "Formatted JSON will appear here.") { toast("Nothing to copy yet.", "err"); return; }
    navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard", "ok"); });
  });

  els.downloadBtn.addEventListener("click", function () {
    var text = els.output.textContent;
    if (!text || text === "Formatted JSON will appear here.") { toast("Nothing to download yet.", "err"); return; }
    downloadBlob(new Blob([text], { type: "application/json" }), "formatted.json");
  });

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = text ? "msg " + (kind || "info") : "msg";
  }

})();
