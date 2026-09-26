/* Gradient Generator — live preview + CSS/Tailwind/PNG export */
"use strict";

(function () {

  var els = {
    mode: document.getElementById("mode"),
    angle: document.getElementById("angle"),
    angleVal: document.getElementById("angle-val"),
    angleWrap: document.getElementById("angle-wrap"),
    stops: document.getElementById("stops"),
    addStop: document.getElementById("add-stop"),
    delStop: document.getElementById("del-stop"),
    preview: document.getElementById("preview"),
    copyCss: document.getElementById("copy-css"),
    copyTw: document.getElementById("copy-tw"),
    dlPng: document.getElementById("dl-png"),
    codeWrap: document.getElementById("code-wrap"),
    code: document.getElementById("code"),
    codeLabel: document.getElementById("code-label")
  };

  var colors = ["#6366f1", "#a855f7", "#ec4899"];

  function renderStops() {
    els.stops.innerHTML = "";
    colors.forEach(function (c, i) {
      var div = document.createElement("div");
      div.className = "option";
      div.style.display = "inline-block";
      div.style.marginRight = "10px";
      var lbl = document.createElement("label");
      lbl.className = "field";
      lbl.textContent = "Color " + (i + 1);
      var inp = document.createElement("input");
      inp.type = "color";
      inp.value = c;
      inp.addEventListener("input", function () { colors[i] = inp.value; update(); });
      div.appendChild(lbl);
      div.appendChild(inp);
      els.stops.appendChild(div);
    });
  }

  function css() {
    if (els.mode.value === "linear") {
      return "linear-gradient(" + els.angle.value + "deg, " + colors.join(", ") + ")";
    }
    var n = colors.length;
    var blobs = colors.map(function (c, i) {
      var x = 20 + (60 / Math.max(1, n - 1)) * i;
      var y = 30 + ((i % 2) * 40);
      return "radial-gradient(at " + Math.round(x) + "% " + y + "%, " + c + " 0px, transparent 55%)";
    });
    return blobs.join(",\n                   ") + ",\n                   #0b0d14";
  }

  function update() {
    els.angleVal.textContent = els.angle.value + "°";
    els.angleWrap.style.display = els.mode.value === "linear" ? "" : "none";
    var c = css();
    els.preview.style.background = c;
    if (els.mode.value === "mesh") els.preview.style.filter = "saturate(1.3)";
    else els.preview.style.filter = "";
    els.codeWrap.classList.remove("hidden");
    els.codeLabel.textContent = "CSS";
    els.code.value = "background: " + c + ";";
  }

  els.angle.addEventListener("input", update);
  els.mode.addEventListener("change", update);

  els.addStop.addEventListener("click", function () {
    if (colors.length >= 6) { toast("Maximum 6 colors.", "err"); return; }
    var r = Math.round(Math.random() * 360);
    colors.push("hsl(" + r + ", 70%, 55%)");
    renderStops();
    update();
  });

  els.delStop.addEventListener("click", function () {
    if (colors.length <= 2) { toast("Minimum 2 colors.", "err"); return; }
    colors.pop();
    renderStops();
    update();
  });

  function copy(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(label + " copied!", "ok"); });
    }
  }

  els.copyCss.addEventListener("click", function () { copy(els.code.value, "CSS"); });

  els.copyTw.addEventListener("click", function () {
    var tw = "bg-[background:" + css().replace(/\s+/g, "_") + "]";
    els.codeLabel.textContent = "Tailwind (arbitrary value)";
    els.code.value = tw;
    copy(tw, "Tailwind class");
  });

  els.dlPng.addEventListener("click", function () {
    var canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 675;
    var g = canvas.getContext("2d");
    if (els.mode.value === "linear") {
      var rad = (parseFloat(els.angle.value) - 90) * Math.PI / 180;
      var x0 = 600 - Math.cos(rad) * 800, y0 = 337 - Math.sin(rad) * 800;
      var x1 = 600 + Math.cos(rad) * 800, y1 = 337 + Math.sin(rad) * 800;
      var grad = g.createLinearGradient(x0, y0, x1, y1);
      colors.forEach(function (c, i) { grad.addColorStop(i / (colors.length - 1), c); });
      g.fillStyle = grad;
    } else {
      g.fillStyle = "#0b0d14";
      colors.forEach(function (c, i) {
        var x = (20 + (60 / Math.max(1, colors.length - 1)) * i) / 100 * 1200;
        var y = (30 + (i % 2) * 40) / 100 * 675;
        var r = 520;
        var grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, c);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 1200, 675);
      });
    }
    g.fillRect(0, 0, 1200, 675);
    canvas.toBlob(function (blob) {
      if (blob) downloadBlob(blob, "gradient.png");
    }, "image/png");
  });

  renderStops();
  update();

})();
