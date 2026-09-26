/* File Hash Comparer — SHA-256 via crypto.subtle, fully local */
"use strict";

(function () {

  var els = {
    dzA: document.getElementById("dz-a"),
    dzB: document.getElementById("dz-b"),
    faName: document.getElementById("fa-name"),
    fbName: document.getElementById("fb-name"),
    faInfo: document.getElementById("fa-info"),
    fbInfo: document.getElementById("fb-info"),
    result: document.getElementById("result-panel"),
    verdict: document.getElementById("verdict"),
    hashesWrap: document.getElementById("hashes-wrap"),
    ha: document.getElementById("ha"),
    hb: document.getElementById("hb")
  };

  var state = { a: null, b: null };

  makeDropzone({ el: els.dzA, onFiles: function (f) { got(f[0], "a"); } });
  makeDropzone({ el: els.dzB, onFiles: function (f) { got(f[0], "b"); } });

  function got(file, slot) {
    if (!file) return;
    state[slot] = { name: file.name, size: file.size, file: file, hash: null };
    if (slot === "a") {
      els.faName.innerHTML = "Drop or <b>browse</b> the first file";
      els.faInfo.textContent = file.name;
    } else {
      els.fbName.innerHTML = "Drop or <b>browse</b> the second file";
      els.fbInfo.textContent = file.name;
    }
    if (state.a && state.b) compare();
  }

  function sha256(file) {
    return file.arrayBuffer().then(function (ab) {
      return crypto.subtle.digest("SHA-256", ab);
    }).then(function (buf) {
      var u8 = new Uint8Array(buf);
      var s = "";
      for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? "0" : "") + u8[i].toString(16);
      return s;
    });
  }

  function compare() {
    var a = state.a, b = state.b;
    els.verdict.innerHTML = '<div class="msg busy" style="display:block">Hashing both files…</div>';
    els.hashesWrap.classList.remove("hidden");
    els.result.classList.remove("hidden");
    els.result.scrollIntoView({ behavior: "smooth", block: "start" });
    Promise.all([sha256(a.file), sha256(b.file)]).then(function (hashes) {
      a.hash = hashes[0];
      b.hash = hashes[1];
      els.ha.value = a.hash;
      els.hb.value = b.hash;
      var same = a.hash === b.hash && a.size === b.size;
      if (same) {
        els.verdict.innerHTML =
          '<div class="msg ok" style="display:block; font-size:1.05rem">✅ <b>Identical files.</b> Both files are byte-for-byte the same (same SHA-256 and size).</div>';
      } else {
        var sameSize = a.size === b.size ? "Sizes match, but the contents differ." :
          "Sizes differ: " + formatBytes(a.size) + " vs " + formatBytes(b.size) + ".";
        els.verdict.innerHTML =
          '<div class="msg err" style="display:block; font-size:1.05rem">❌ <b>Different files.</b> ' + sameSize + "</div>";
      }
    }).catch(function () {
      els.verdict.innerHTML = '<div class="msg err" style="display:block">Could not hash these files (are they very large?).</div>';
    });
  }

})();
