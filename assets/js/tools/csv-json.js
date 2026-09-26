/* CSV ↔ JSON Converter — PapaParse, fully local */
"use strict";

(function () {

  if (typeof Papa === "undefined") { missingLib("PapaParse (run build.sh)"); return; }

  var els = {
    csvIn: document.getElementById("csv-in"),
    toJson: document.getElementById("to-json-btn"),
    jsonOut: document.getElementById("json-out"),
    jsonOutWrap: document.getElementById("json-out-wrap"),
    copyJson: document.getElementById("copy-json-btn"),
    dlJson: document.getElementById("dl-json-btn"),
    msg1: document.getElementById("msg1"),
    jsonIn: document.getElementById("json-in"),
    toCsv: document.getElementById("to-csv-btn"),
    csvOut: document.getElementById("csv-out"),
    csvOutWrap: document.getElementById("csv-out-wrap"),
    copyCsv: document.getElementById("copy-csv-btn"),
    dlCsv: document.getElementById("dl-csv-btn"),
    msg2: document.getElementById("msg2")
  };

  function msg(el, text, kind) {
    el.textContent = text;
    el.className = "msg " + (kind || "info");
  }

  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast("Copy failed — select the text manually.", "err"); });
    } else {
      toast("Copy not available — select the text manually.", "err");
    }
  }

  /* drop .csv / .json files onto the textareas */
  [els.csvIn, els.jsonIn].forEach(function (ta) {
    ta.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      e.preventDefault();
      var r = new FileReader();
      r.onload = function () { ta.value = r.result; };
      r.readAsText(f);
    });
    ta.addEventListener("dragover", function (e) { e.preventDefault(); });
  });

  /* ---------- CSV -> JSON ---------- */
  els.toJson.addEventListener("click", function () {
    var text = els.csvIn.value.trim();
    if (!text) { msg(els.msg1, "Paste some CSV (or drop a .csv file) first.", "err"); return; }
    try {
      var res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
      if (res.errors.length && !res.data.length) {
        msg(els.msg1, "Could not parse this CSV: " + res.errors[0].message, "err");
        return;
      }
      els.jsonOut.value = JSON.stringify(res.data, null, 2);
      els.jsonOutWrap.classList.remove("hidden");
      msg(els.msg1, "Converted " + res.data.length + " row(s) to JSON.", "ok");
    } catch (e) {
      msg(els.msg1, "Could not parse this CSV.", "err");
    }
  });

  els.copyJson.addEventListener("click", function () { copyText(els.jsonOut.value, function () { toast("JSON copied!", "ok"); }); });
  els.dlJson.addEventListener("click", function () {
    if (els.jsonOut.value) downloadBlob(new Blob([els.jsonOut.value], { type: "application/json" }), "data.json");
  });

  /* ---------- JSON -> CSV ---------- */
  els.toCsv.addEventListener("click", function () {
    var text = els.jsonIn.value.trim();
    if (!text) { msg(els.msg2, "Paste some JSON first.", "err"); return; }
    try {
      var data = JSON.parse(text);
      if (!Array.isArray(data)) data = [data];
      var csv = Papa.unparse(data);
      els.csvOut.value = csv;
      els.csvOutWrap.classList.remove("hidden");
      msg(els.msg2, "Converted " + data.length + " record(s) to CSV.", "ok");
    } catch (e) {
      msg(els.msg2, "Invalid JSON: " + e.message, "err");
    }
  });

  els.copyCsv.addEventListener("click", function () { copyText(els.csvOut.value, function () { toast("CSV copied!", "ok"); }); });
  els.dlCsv.addEventListener("click", function () {
    if (els.csvOut.value) downloadBlob(new Blob([els.csvOut.value], { type: "text/csv" }), "data.csv");
  });

})();
