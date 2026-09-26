/* Aspect Ratio Calculator — fully local */
"use strict";

(function () {

  var els = {
    presets: document.getElementById("presets"),
    rw: document.getElementById("rw"),
    rh: document.getElementById("rh"),
    side: document.getElementById("side"),
    px: document.getElementById("px"),
    result: document.getElementById("result"),
    sizes: document.getElementById("sizes")
  };

  var COMMON = [
    ["HD", 1280], ["Full HD", 1920], ["2K", 2560], ["4K UHD", 3840], ["720p", 1280],
    ["Instagram post", 1080], ["Instagram story", 1080], ["YouTube thumb", 1280], ["Twitter/X post", 1200]
  ];

  function compute() {
    var rw = parseFloat(els.rw.value) || 0;
    var rh = parseFloat(els.rh.value) || 0;
    if (rw <= 0 || rh <= 0) { els.result.textContent = "Enter a valid ratio."; els.result.className = "msg err"; els.sizes.innerHTML = ""; return; }
    var px = parseFloat(els.px.value) || 0;
    var ratio = rw / rh;

    var out;
    if (px <= 0) {
      out = "Enter pixels to calculate.";
    } else if (els.side.value === "w") {
      var h = Math.round(px / ratio);
      out = "Width " + px + " px  →  Height " + h + " px   (" + ratio.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + ":1)";
    } else {
      var w = Math.round(px * ratio);
      out = "Height " + px + " px  →  Width " + w + " px   (" + ratio.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") + ":1)";
    }
    els.result.textContent = out;
    els.result.className = "msg ok";

    /* size table */
    els.sizes.innerHTML = "";
    var table = document.createElement("div");
    COMMON.forEach(function (row) {
      var name = row[0], long = row[1];
      var w, h;
      if (ratio >= 1) { w = long; h = Math.round(long / ratio); }
      else { h = long; w = Math.round(long * ratio); }
      var r = document.createElement("div");
      r.className = "file-row";
      r.innerHTML = '<div class="meta"><div class="name"></div><div class="size"></div></div>';
      r.querySelector(".name").textContent = name;
      r.querySelector(".size").textContent = w + " × " + h + " px";
      table.appendChild(r);
    });
    els.sizes.appendChild(table);
  }

  [els.rw, els.rh, els.px].forEach(function (el) {
    el.addEventListener("input", compute);
  });
  els.side.addEventListener("change", compute);

  els.presets.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-w]");
    if (!btn) return;
    els.rw.value = btn.getAttribute("data-w");
    els.rh.value = btn.getAttribute("data-h");
    compute();
  });

  compute();

})();
