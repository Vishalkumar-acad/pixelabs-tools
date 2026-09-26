/* Data Unit Converter — fully local */
"use strict";

(function () {

  var els = {
    val: document.getElementById("val"),
    unit: document.getElementById("unit"),
    scale: document.getElementById("scale"),
    results: document.getElementById("results"),
    speed: document.getElementById("speed"),
    timeEst: document.getElementById("time-est")
  };

  /* [name, bits] — everything is measured in bits internally */
  var UNITS = [
    ["bit (b)", 1],
    ["kilobit (kb)", null],
    ["megabit (Mb)", null],
    ["gigabit (Gb)", null],
    ["byte (B)", 8],
    ["kilobyte (KB / KiB)", null],
    ["megabyte (MB / MiB)", null],
    ["gigabyte (GB / GiB)", null],
    ["terabyte (TB / TiB)", null],
    ["petabyte (PB / PiB)", null]
  ];

  var NAMES = ["bit", "kilobit", "megabit", "gigabit", "byte", "kilobyte", "megabyte", "gigabyte", "terabyte", "petabyte"];

  function bitsFor(index) {
    var scale = parseInt(els.scale.value, 10);
    if (index === 0) return 1;
    if (index === 4) return 8;
    var isByte = index >= 4;
    var steps = isByte ? index - 4 : index;
    return (isByte ? 8 : 1) * Math.pow(scale, steps);
  }

  function fmt(n) {
    if (n === 0) return "0";
    if (n >= 1) {
      return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 0 : 2 });
    }
    return n.toPrecision(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function compute() {
    var v = parseFloat(els.val.value) || 0;
    var idx = parseInt(els.unit.value, 10);
    var bits = v * bitsFor(idx);

    els.results.innerHTML = "";
    NAMES.forEach(function (name, i) {
      var b = bitsFor(i);
      var row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = '<div class="meta"><div class="name"></div><div class="size"></div></div>';
      row.querySelector(".name").textContent = name;
      row.querySelector(".size").textContent = fmt(bits / b) + " " + name;
      if (i === idx) row.classList.add("done");
      els.results.appendChild(row);
    });

    /* download time: bits at Mbps */
    var mbps = parseInt(els.speed.value, 10);
    var seconds = bits / (mbps * 1000000);
    var phrase;
    if (seconds < 1) phrase = "less than a second";
    else if (seconds < 60) phrase = Math.round(seconds) + " seconds";
    else if (seconds < 3600) phrase = Math.round(seconds / 60) + " minutes";
    else if (seconds < 86400) phrase = (seconds / 3600).toFixed(1) + " hours";
    else phrase = (seconds / 86400).toFixed(1) + " days";
    els.timeEst.textContent = "At " + mbps + " Mbps, " + fmt(v) + " " + NAMES[idx] + "(s) transfers in about " + phrase + ".";
  }

  UNITS.forEach(function (u, i) {
    var opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = u[0];
    els.unit.appendChild(opt);
  });
  els.unit.value = "6"; /* megabyte */

  [els.val, els.unit, els.scale, els.speed].forEach(function (el) {
    el.addEventListener("input", compute);
    el.addEventListener("change", compute);
  });

  compute();

})();
