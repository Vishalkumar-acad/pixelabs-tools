/* ============================================================
   PixelAbs Tools — Toxicity Checker
   Sends the text to our own content-moderation service: a
   DistilBERT int8 model plus a profanity wordlist and
   harassment-phrase rules, in that order.

   NOTE: this is the one tool in the suite that DOES send your
   text to a server — a 64 MB model cannot be run on every
   phone. The page says so plainly, above the box.
   ============================================================ */
"use strict";

(function () {

  var els = {
    input: document.getElementById("tc-input"),
    runBtn: document.getElementById("run-btn"),
    clearBtn: document.getElementById("clear-btn"),
    msg: document.getElementById("msg"),
    panel: document.getElementById("result-panel"),
    verdict: document.getElementById("verdict"),
    bar: document.getElementById("score-bar"),
    score: document.getElementById("score-val"),
    rule: document.getElementById("rule-val"),
    meta: document.getElementById("meta")
  };

  var MAX_CHARS = 5000;
  var busy = false;

  function showMsg(text, kind) {
    els.msg.textContent = text;
    els.msg.className = text ? "msg " + (kind || "info") : "msg";
  }

  /* ---- one call to the moderation service (through our own origin) ---- */
  function moderate(text, onTick) {
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var started = Date.now();
    var timer = setInterval(function () {
      if (onTick) onTick(Math.round((Date.now() - started) / 1000));
    }, 1000);
    var killer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 100000);
    function done() { clearInterval(timer); clearTimeout(killer); }

    return fetch("/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (r.ok) { return r.json().then(function (j) { done(); return j; }); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        done();
        if (r.status === 503) throw new Error("the model is still loading");
        throw new Error((j && (j.detail || j.error)) || ("server error " + r.status));
      });
    }).catch(function (err) {
      done();
      if (err && err.name === "AbortError") throw new Error("the service took too long to answer");
      throw err;
    });
  }

  var RULE_TEXT = {
    profanity_list: "matched an abusive word",
    harassment_pattern: "matched a harassment phrase",
    model: "the DistilBERT model"
  };

  function render(res) {
    var score = typeof res.score === "number" ? res.score : 0;
    var pct = Math.round(score * 100);
    var zone = score >= 0.9 ? "high" : (score >= 0.5 ? "mid" : "low");
    var cls = score >= 0.9 ? "bad" : (score >= 0.5 ? "warn" : "good");

    els.verdict.className = "tc-verdict " + cls;
    els.verdict.textContent = score >= 0.9 ? "Likely toxic"
      : (score >= 0.5 ? "Possibly toxic — worth a second look" : "Looks clean");

    els.bar.className = "tc-fill " + cls;
    els.bar.style.width = Math.max(3, pct) + "%";
    els.score.textContent = score.toFixed(4);
    els.rule.textContent = RULE_TEXT[res.matched_rule] || res.matched_rule || "the model";
    els.meta.textContent = (res.text_length ? res.text_length + " characters · " : "") +
      (res.label ? "label: " + res.label : "");

    els.panel.classList.remove("hidden");
  }

  function run() {
    if (busy) return;
    var text = (els.input.value || "").trim();
    if (!text) { showMsg("Type or paste some text first.", "err"); return; }
    if (text.length > MAX_CHARS) {
      showMsg("That is " + text.length + " characters — please keep it under " + MAX_CHARS + ".", "err");
      return;
    }

    busy = true;
    els.runBtn.disabled = true;
    els.clearBtn.disabled = true;
    els.panel.classList.add("hidden");
    showMsg("Checking…", "info");

    moderate(text, function (s) {
      showMsg(s < 8
        ? "Checking… " + s + "s"
        : "Checking… " + s + "s — the free host sleeps when idle, so the first check of the day can take up to a minute.", "info");
    }).then(function (res) {
      showMsg("", "");
      render(res);
    }).catch(function (err) {
      showMsg("Could not check that text: " + (err.message || err) + ". Nothing was stored.", "err");
    }).then(function () {
      busy = false;
      els.runBtn.disabled = false;
      els.clearBtn.disabled = false;
    });
  }

  els.runBtn.addEventListener("click", run);
  els.clearBtn.addEventListener("click", function () {
    els.input.value = "";
    els.panel.classList.add("hidden");
    showMsg("", "");
    els.input.focus();
  });
  els.input.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
  });
  els.input.addEventListener("input", function () {
    if (els.msg.className.indexOf("err") !== -1) showMsg("", "");
  });

  document.querySelectorAll("[data-sample]").forEach(function (b) {
    b.addEventListener("click", function () {
      els.input.value = b.getAttribute("data-sample");
      els.panel.classList.add("hidden");
      showMsg("", "");
      els.input.focus();
    });
  });

})();
