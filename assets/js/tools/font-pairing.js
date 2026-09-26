/* Font Pairing Helper — curated combos + Google Fonts embed code */
"use strict";

(function () {

  var els = {
    pair: document.getElementById("pair"),
    pHead: document.getElementById("p-head"),
    pBody: document.getElementById("p-body"),
    code: document.getElementById("code"),
    copy: document.getElementById("copy-btn")
  };

  /* heading, body, weights, local look-alike stacks for offline preview */
  var PAIRS = [
    { h: "Playfair Display", b: "Source Sans 3", hw: "700", bw: "400;600",
      hs: "Georgia, 'Times New Roman', serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Poppins", b: "Inter", hw: "600", bw: "400",
      hs: "'Segoe UI', Verdana, sans-serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Merriweather", b: "Open Sans", hw: "700", bw: "400",
      hs: "Georgia, serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Oswald", b: "Lato", hw: "500", bw: "400",
      hs: "'Arial Narrow', Impact, sans-serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Montserrat", b: "Merriweather", hw: "600", bw: "300;400",
      hs: "'Segoe UI', Arial, sans-serif", bs: "Georgia, serif" },
    { h: "Bebas Neue", b: "Roboto", hw: "400", bw: "400",
      hs: "'Arial Narrow', Impact, sans-serif", bs: "Arial, sans-serif" },
    { h: "Lora", b: "Work Sans", hw: "600", bw: "400",
      hs: "Georgia, serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Raleway", b: "Lato", hw: "700", bw: "400",
      hs: "'Segoe UI', Arial, sans-serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Nunito", b: "Nunito Sans", hw: "700", bw: "400",
      hs: "'Segoe UI Rounded', 'Segoe UI', sans-serif", bs: "'Segoe UI', Arial, sans-serif" },
    { h: "Cinzel", b: "Cormorant Garamond", hw: "600", bw: "400",
      hs: "Georgia, 'Times New Roman', serif", bs: "Georgia, serif" }
  ];

  PAIRS.forEach(function (p, i) {
    var opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.h + " + " + p.b;
    els.pair.appendChild(opt);
  });

  function update() {
    var p = PAIRS[parseInt(els.pair.value, 10) || 0];
    els.pHead.style.fontFamily = p.hs;
    els.pBody.style.fontFamily = p.bs;
    var families = [];
    if (families.indexOf(p.h) === -1) families.push(p.h);
    if (families.indexOf(p.b) === -1) families.push(p.b);
    var css = "https://fonts.googleapis.com/css2?" +
      families.map(function (f) {
        return "family=" + f.replace(/ /g, "+") + ":wght@" + (f === p.h ? p.hw : p.bw);
      }).join("&") + "&display=swap";

    els.code.value =
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link rel="stylesheet" href="' + css + '">\n\n' +
      '<style>\n' +
      "  h1, h2, h3 { font-family: '" + p.h + "', " + p.bs + "; font-weight: " + p.hw + "; }\n" +
      "  body { font-family: '" + p.b + "', " + p.bs + "; }\n" +
      "</style>";
  }

  els.pair.addEventListener("change", update);
  update();

  els.copy.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(els.code.value).then(function () { toast("Embed code copied!", "ok"); });
    }
  });

})();
