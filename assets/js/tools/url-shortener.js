/* URL Shortener — creates short links via the site's /api functions */
"use strict";

(function () {

  var els = {
    input: document.getElementById("url-input"),
    btn: document.getElementById("shorten-btn"),
    msg: document.getElementById("msg"),
    resultPanel: document.getElementById("result-panel"),
    shortUrl: document.getElementById("short-url"),
    copyBtn: document.getElementById("copy-btn"),
    openBtn: document.getElementById("open-btn"),
    qrHolder: document.getElementById("qr-holder"),
    dlqrBtn: document.getElementById("dlqr-btn")
  };

  var lastQrPng = null;

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = "msg " + (kind || "info");
  }

  els.btn.addEventListener("click", function () {
    var u = els.input.value.trim();
    if (!u) { showMsg("Paste a link first.", "err"); return; }
    if (u.slice(0, 7) !== "http://" && u.slice(0, 8) !== "https://") {
      showMsg("The link must start with http:// or https://", "err");
      return;
    }
    if (u.length > 2048) { showMsg("That link is too long (2048 character limit).", "err"); return; }

    els.btn.disabled = true;
    showMsg("Creating your short link…", "info");

    fetch("/api/url/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: u })
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      els.btn.disabled = false;
      if (!r.ok || !r.data || !r.data.ok) {
        showMsg((r.data && r.data.error) || "Could not create the short link — please try again.", "err");
        return;
      }
      var short = r.data.short || (location.origin + "/s/" + r.data.code);
      showMsg("Done! Your short link is ready below.", "ok");
      renderResult(short);
    }).catch(function () {
      els.btn.disabled = false;
      showMsg("Network error — please check your connection and try again.", "err");
    });
  });

  function renderResult(short) {
    els.shortUrl.textContent = short;
    els.shortUrl.href = short;
    els.openBtn.onclick = function () { window.open(short, "_blank", "noopener"); };

    /* QR code (rendered locally, as always) */
    els.qrHolder.innerHTML = "";
    lastQrPng = null;
    try {
      new QRCode(els.qrHolder, {
        text: short,
        width: 240,
        height: 240,
        colorDark: "#131a2a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
      setTimeout(function () {
        var canvas = els.qrHolder.querySelector("canvas");
        if (canvas) {
          try { lastQrPng = canvas.toDataURL("image/png"); } catch (e) { lastQrPng = null; }
        }
      }, 60);
    } catch (e) {
      els.qrHolder.textContent = "QR unavailable";
    }

    els.resultPanel.classList.remove("hidden");
    els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  els.copyBtn.addEventListener("click", function () {
    var text = els.shortUrl.textContent;
    function done() { toast("Short link copied!", "ok"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  });

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed — long-press the link to copy it.", "err"); }
    ta.remove();
  }

  els.dlqrBtn.addEventListener("click", function () {
    if (!lastQrPng) { toast("QR code is not ready yet — try again in a second.", "err"); return; }
    var a = document.createElement("a");
    a.href = lastQrPng;
    a.download = "short-link-qr.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* Enter key = shorten */
  els.input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); els.btn.click(); }
  });

})();
