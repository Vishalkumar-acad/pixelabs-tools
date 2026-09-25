/* Text Case Converter — all local */
"use strict";

(function () {

  var els = {
    input: document.getElementById("input"),
    output: document.getElementById("output"),
    stats: document.getElementById("stats"),
    copyBtn: document.getElementById("copy-btn"),
    clearBtn: document.getElementById("clear-btn")
  };

  function words(text) {
    return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_\-]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim().split(/\s+/).filter(Boolean);
  }

  var CASES = {
    upper: function (t) { return t.toUpperCase(); },
    lower: function (t) { return t.toLowerCase(); },
    title: function (t) {
      return t.toLowerCase().replace(/(^|\s|["'(\[{])(\p{L})/gu, function (m, p, c) { return p + c.toUpperCase(); });
    },
    sentence: function (t) {
      return t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, function (m, p, c) { return p + c.toUpperCase(); });
    },
    camel: function (t) {
      return words(t).map(function (w, i) {
        w = w.toLowerCase();
        return i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1);
      }).join("");
    },
    pascal: function (t) {
      return words(t).map(function (w) {
        w = w.toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join("");
    },
    snake: function (t) { return words(t).join("_").toLowerCase(); },
    kebab: function (t) { return words(t).join("-").toLowerCase(); }
  };

  document.querySelectorAll("[data-case]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = els.input.value;
      if (!text.trim()) { toast("Type or paste some text first.", "err"); return; }
      els.output.textContent = CASES[btn.getAttribute("data-case")](text);
    });
  });

  function updateStats() {
    var t = els.input.value;
    var w = t.trim() ? t.trim().split(/\s+/).length : 0;
    var l = t ? t.split("\n").length : 0;
    els.stats.textContent = t.length.toLocaleString() + " characters · " + w.toLocaleString() + " words · " + l.toLocaleString() + " lines";
  }
  els.input.addEventListener("input", updateStats);
  updateStats();

  els.copyBtn.addEventListener("click", function () {
    var text = els.output.textContent;
    if (!text || text === "Converted text will appear here.") { toast("Nothing to copy yet.", "err"); return; }
    navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard", "ok"); });
  });

  els.clearBtn.addEventListener("click", function () {
    els.input.value = "";
    els.output.textContent = "Converted text will appear here.";
    updateStats();
  });

})();
